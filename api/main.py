import logging
import os
import tempfile
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError
from starlette.datastructures import UploadFile as StarletteUploadFile

from engine import __version__ as ENGINE_VERSION
from engine.chords import CremaChordModel
from api.cache import ChartCache
from api.jobs import JobStore
from api.videoid import extract_video_id

logger = logging.getLogger(__name__)

_chord_model = None
_chord_model_lock = threading.Lock()


def _get_chord_model():
    """Process-wide chord model: weights load once, not once per job."""
    global _chord_model
    with _chord_model_lock:
        if _chord_model is None:
            _chord_model = CremaChordModel()
        return _chord_model


def _warm_models() -> None:
    """Preload every model the pipeline needs so the first job doesn't pay
    import/model-load latency (~7s). Failures are non-fatal: the job path
    loads lazily anyway."""
    try:
        _get_chord_model()
        import crema.analyze  # noqa: F401  (keras model builds at import)

        from engine.separate import _get_separator, _pick_device
        _get_separator("htdemucs", _pick_device())

        from crepe.core import build_and_load_model
        build_and_load_model("small")
        logger.info("model warmup complete")
    except Exception:
        logger.warning("model warmup failed; models will load on first job",
                       exc_info=True)


@asynccontextmanager
async def _lifespan(app: FastAPI):
    threading.Thread(target=lambda: _warm_models(), daemon=True).start()
    yield


app = FastAPI(title="tabIt API", lifespan=_lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

cache = ChartCache(os.environ.get("TABIT_CACHE_DIR", "data/charts"))
jobs = JobStore()

MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB
UPLOAD_CHUNK_BYTES = 1024 * 1024  # 1 MB


def _run_analysis(src: str) -> dict:
    """Run the engine on a URL or file path; returns chart as a plain dict.
    Module-level so tests can monkeypatch it."""
    import engine.pipeline

    created_at = datetime.now(timezone.utc).isoformat()
    return engine.pipeline.analyze(
        src, created_at=created_at, chord_model=_get_chord_model()
    ).model_dump()


class AnalyzeBody(BaseModel):
    url: str


@app.get("/health")
def health():
    return {"status": "ok", "engineVersion": ENGINE_VERSION}


@app.post("/analyze", status_code=202)
async def analyze_submit(request: Request):
    # FastAPI 0.139's disambiguation of an optional pydantic JSON body
    # alongside an optional multipart File param on the same endpoint drops
    # the JSON body silently (it never validates it, `body` stays None even
    # when a valid JSON payload is sent). Rather than declare both params
    # and rely on FastAPI to route between them, inspect content-type
    # ourselves and parse only the branch that applies.
    content_type = request.headers.get("content-type", "")

    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        file = form.get("file")
        if not isinstance(file, StarletteUploadFile):
            raise HTTPException(status_code=422, detail="Provide a YouTube url or an audio file.")

        suffix = os.path.splitext(file.filename or "upload")[1] or ".bin"
        fd, tmp = tempfile.mkstemp(suffix=suffix, prefix="tabit_upload_")
        total = 0
        too_large = False
        with os.fdopen(fd, "wb") as out:
            while True:
                chunk = await file.read(UPLOAD_CHUNK_BYTES)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    too_large = True
                    break
                out.write(chunk)
        if too_large:
            if os.path.exists(tmp):
                os.remove(tmp)
            raise HTTPException(status_code=413, detail="Audio file too large (100 MB max).")

        def work():
            try:
                chart = _run_analysis(tmp)
                cache.put(chart)
                return chart
            finally:
                if os.path.exists(tmp):
                    os.remove(tmp)  # never persist uploaded audio

        return {"jobId": jobs.submit(work)}

    try:
        payload = await request.json()
    except Exception:
        payload = None

    try:
        body = AnalyzeBody.model_validate(payload) if payload is not None else None
    except ValidationError:
        body = None

    if body is None or not body.url:
        raise HTTPException(status_code=422, detail="Provide a YouTube url or an audio file.")

    video_id = extract_video_id(body.url)
    if video_id is None:
        raise HTTPException(
            status_code=422,
            detail="That doesn't look like a YouTube link. Paste a youtube.com or youtu.be URL, or upload an audio file.",
        )

    cached = cache.get(video_id, ENGINE_VERSION)
    if cached:
        return {"jobId": jobs.submit_done(cached)}

    url = body.url

    def work():
        chart = _run_analysis(url)
        cache.put(chart)
        return chart

    return {"jobId": jobs.submit(work)}


@app.get("/analyze/{job_id}")
def analyze_status(job_id: str):
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="unknown job")
    return job


@app.get("/chart/{video_id}")
def chart(video_id: str):
    found = cache.get(video_id, ENGINE_VERSION)
    if found is None:
        raise HTTPException(status_code=404, detail="not analyzed yet")
    return found
