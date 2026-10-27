import logging
import os
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile as StarletteUploadFile

from engine import __version__ as ENGINE_VERSION, engine_version
from engine.chord_backend import backend_of, requested_backend, select_chord_model
from api.cache import ChartCache
from api.jobs import JobStore
from api.videoid import extract_video_id

logger = logging.getLogger(__name__)

_chord_model = None
_chord_model_lock = threading.Lock()
_chord_model_at = 0.0
# After a silent btc -> crema fallback, try btc again on a later job, but not on
# every request while offline (each attempt can wait out a network timeout).
BTC_RETRY_SEC = 60.0


def _get_chord_model():
    """Process-wide chord model: weights load once, not once per job. If the
    default btc backend fell back to crema (weights unavailable), retry btc
    periodically instead of pinning crema until restart."""
    global _chord_model, _chord_model_at
    with _chord_model_lock:
        fell_back = (_chord_model is not None
                     and backend_of(_chord_model) == "crema"
                     and requested_backend() == ("btc", False)
                     and time.monotonic() - _chord_model_at >= BTC_RETRY_SEC)
        if _chord_model is None or fell_back:
            _chord_model = select_chord_model()
            _chord_model_at = time.monotonic()
        return _chord_model


def _engine_version() -> str:
    """Cache/chart version for the active chord backend (e.g. 0.4.0-btc)."""
    return engine_version(backend_of(_get_chord_model()))


def _warm_models() -> None:
    """Preload every model the pipeline needs so the first job doesn't pay
    import/model-load latency (~7s). Failures are non-fatal: the job path
    loads lazily anyway."""
    try:
        from helper.warmup import warm_all

        warm_all(progress=lambda m: logger.info("warmup: %s", m),
                 get_chord_model=_get_chord_model)
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


def _run_analysis(src: str, on_step=None) -> dict:
    """Run the engine on a URL or file path; returns chart as a plain dict.
    Module-level so tests can monkeypatch it."""
    import engine.pipeline

    created_at = datetime.now(timezone.utc).isoformat()
    return engine.pipeline.analyze(
        src, created_at=created_at, chord_model=_get_chord_model(),
        on_step=on_step,
    ).model_dump()


class AnalyzeBody(BaseModel):
    url: str


def _health_engine_version() -> str:
    """Backend-tagged version without loading (or downloading) any model."""
    with _chord_model_lock:
        model = _chord_model
    backend = backend_of(model) if model is not None else requested_backend()[0]
    return engine_version(backend)


@app.get("/health")
def health():
    return {"status": "ok", "engineVersion": _health_engine_version()}


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

        def work(job_id: str):
            try:
                chart = _run_analysis(tmp, on_step=lambda s: jobs.set_step(job_id, s))
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

    # May fetch BTC weights on the very first call; keep it off the event loop.
    cached = cache.get(video_id, await run_in_threadpool(_engine_version))
    if cached:
        return {"jobId": jobs.submit_done(cached)}

    url = body.url

    def work(job_id: str):
        chart = _run_analysis(url, on_step=lambda s: jobs.set_step(job_id, s))
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
    found = cache.get(video_id, _engine_version())
    if found is None:
        raise HTTPException(status_code=404, detail="not analyzed yet")
    return found
