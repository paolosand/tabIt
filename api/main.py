import os
import tempfile
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError
from starlette.datastructures import UploadFile as StarletteUploadFile

from engine import __version__ as ENGINE_VERSION
from api.cache import ChartCache
from api.jobs import JobStore
from api.videoid import extract_video_id

app = FastAPI(title="tabIt API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

cache = ChartCache(os.environ.get("TABIT_CACHE_DIR", "data/charts"))
jobs = JobStore()


def _run_analysis(src: str) -> dict:
    """Run the engine on a URL or file path; returns chart as a plain dict.
    Module-level so tests can monkeypatch it."""
    from engine.pipeline import analyze

    created_at = datetime.now(timezone.utc).isoformat()
    return analyze(src, created_at=created_at).model_dump()


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
        with os.fdopen(fd, "wb") as out:
            out.write(await file.read())

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
    if video_id:
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
