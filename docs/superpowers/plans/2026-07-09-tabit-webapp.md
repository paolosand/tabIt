# tabIt Web App Implementation Plan (sub-project 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tabIt web app — FastAPI backend wrapping the merged MIR engine, plus a React frontend implementing the approved Claude Design prototype (`docs/design/TabIt.dc.html`): paste a YouTube URL or drop an audio file, watch the analysis run, then play along with a synced, editable chord sheet.

**Architecture:** Two packages. `api/` is a thin FastAPI layer over `engine.pipeline.analyze`: async job pattern (submit → poll), single-worker executor (the engine is heavyweight; serialize analyses), disk cache keyed `videoId@engineVersion`. `web/` is a Vite + React + TypeScript SPA that is a pure renderer of the chart JSON: a three-stage state machine (landing → analyzing → sheet) matching the design prototype screen-for-screen, with playback time from either the YouTube IFrame player (URL flow) or a local `<audio>` element (file flow) behind one interface.

**Tech Stack:** Python 3.11 (existing venv), FastAPI, uvicorn; Node 20, Vite, React 18, TypeScript, vitest + React Testing Library.

## Global Constraints

- **The chart JSON contract is `engine/schema.py`.** Frontend TypeScript types mirror it exactly: `ChordSegment {start, end, label, root, quality, bass, confidence}`, `Key {tonic, mode, confidence}`, `Scale {name, notes}`, `Tempo {bpm}`, `Source {kind, videoId?, title?, duration}`, `Chart {schemaVersion, source, analysis, key, scales, tempo, beats, sections, chords}`.
- **Design parity:** `docs/design/TabIt.dc.html` (committed) is the visual source of truth. Copy its inline styles, copy, spacing, and animation values verbatim when building screens; `style-hover`/`style-active` attributes become CSS classes. The landing screen's "Demo mode" footnote is REMOVED (the real app analyzes for real). Fraunces is loaded from Google Fonts exactly as the design's helmet does.
- **Never persist source audio server-side.** Uploaded files go to a temp path, are analyzed, and deleted in a `finally`. Only chart JSON is stored (cache dir).
- **Pitch classes are canonical sharps** (`NOTE_ORDER = ['A','A#','B','C','C#','D','D#','E','F','F#','G','G#']` as in the design; engine emits sharps, so no conversion needed).
- **Quality suffixes mirror `engine/schema.py` `QUALITY_SUFFIX` exactly** (maj:'', min:'m', dom7:'7', maj7:'maj7', min7:'m7', dim:'dim', aug:'aug', sus2:'sus2', sus4:'sus4', 6:'6', min6:'m6', hdim7:'m7b5', dim7:'dim7', minmaj7:'mMaj7', 9:'9', maj9:'maj9', min9:'m9'). `quality === 'N'` renders as a muted '—', is never clickable, and is skipped by transpose.
- **Low-confidence threshold is 0.75** (from the design): `confidence < 0.75 && !edited` → dimmed color + dotted underline.
- **Ports:** API on 8000, web dev server on 5173 with `/api` proxied to 8000.
- **Python:** same 3.11 venv as the engine; API deps added as a `[project.optional-dependencies] api` extra. **Node:** v20 (installed via nvm on this machine).
- Python tests live in `tests/api/`; web tests colocate as `*.test.ts(x)` under `web/src/`.

---

## File Structure

```
tabit/
├── api/
│   ├── __init__.py
│   ├── videoid.py        # YouTube URL → videoId parsing (pure)
│   ├── cache.py          # ChartCache: disk JSON cache by videoId@engineVersion (pure-ish)
│   ├── jobs.py           # JobStore: single-worker executor, jobId → status/result
│   └── main.py           # FastAPI app: /analyze, /analyze/{id}, /chart/{videoId}, /health
├── tests/api/
│   ├── __init__.py
│   ├── test_videoid.py
│   ├── test_cache.py
│   ├── test_jobs.py
│   └── test_main.py
├── web/
│   ├── index.html                    # Fraunces font link, root div
│   ├── package.json  vite.config.ts  tsconfig.json
│   └── src/
│       ├── main.tsx  App.tsx         # stage state machine (landing|analyzing|sheet)
│       ├── index.css                 # body bg, selection, keyframes, hover classes
│       ├── lib/
│       │   ├── types.ts              # Chart contract types
│       │   ├── music.ts              # transposeRoot, formatLabel, findCurrentIndex
│       │   ├── music.test.ts
│       │   ├── api.ts                # analyzeUrl, analyzeFile, pollJob, getCachedChart
│       │   ├── api.test.ts
│       │   └── overrides.ts          # localStorage-persisted chord overrides
│       ├── playback/
│       │   ├── usePlaybackTime.ts    # rAF-throttled currentTime from a PlaybackSource
│       │   ├── YouTubePlayer.tsx     # IFrame API wrapper
│       │   └── AudioPlayer.tsx       # <audio> for uploaded files
│       └── screens/
│           ├── Landing.tsx
│           ├── Analyzing.tsx
│           ├── Sheet.tsx             # header, chips, transpose, rows, now/next
│           ├── Sheet.test.tsx
│           └── EditPopover.tsx       # fix-this-chord popover
└── docs/design/TabIt.dc.html         # design source of truth (already committed)
```

---

### Task 0: API scaffolding + health endpoint

**Files:**
- Modify: `pyproject.toml` (add `api` extra)
- Create: `api/__init__.py`, `api/main.py` (health only), `tests/api/__init__.py`
- Test: `tests/api/test_main.py` (health check only at this stage)

**Interfaces:**
- Produces: importable `api` package; `api.main.app` (FastAPI); `GET /health` → `{"status":"ok","engineVersion":"0.1.0"}`.

- [ ] **Step 1: Add the extra to `pyproject.toml`** (append to `[project.optional-dependencies]`):

```toml
api = ["fastapi>=0.110", "uvicorn>=0.29", "python-multipart>=0.0.9", "httpx>=0.27"]
```

- [ ] **Step 2: Install** — `source .venv/bin/activate && pip install -e ".[dev,api]" --build-constraint constraints-build.txt`. Expected: resolves cleanly (fastapi/uvicorn have no conflicts with the pinned ML stack; if pip backtracks on `anyio`/`starlette`, pin the versions that resolve and record them).

- [ ] **Step 3: Write failing test `tests/api/test_main.py`:**

```python
from fastapi.testclient import TestClient
from api.main import app


def test_health():
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["engineVersion"]
```

- [ ] **Step 4: Run to verify failure** — `pytest tests/api/test_main.py -v` → FAIL (`ModuleNotFoundError: api`).

- [ ] **Step 5: Implement minimal `api/main.py`:**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from engine import __version__ as ENGINE_VERSION

app = FastAPI(title="tabIt API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "engineVersion": ENGINE_VERSION}
```

Create empty `api/__init__.py` and `tests/api/__init__.py`.

- [ ] **Step 6: Run to verify pass** — `pytest tests/api/test_main.py -v` → PASS.

- [ ] **Step 7: Commit** — `git add pyproject.toml api tests/api && git commit -m "feat(api): scaffold FastAPI app with health endpoint"`.

---

### Task 1: videoId parsing + chart disk cache

**Files:**
- Create: `api/videoid.py`, `api/cache.py`
- Test: `tests/api/test_videoid.py`, `tests/api/test_cache.py`

**Interfaces:**
- Produces:
  - `api.videoid.extract_video_id(url: str) -> str | None` — handles `watch?v=`, `youtu.be/`, `shorts/`, `embed/` forms; returns None for non-YouTube URLs.
  - `api.cache.ChartCache(root: str)` with `.get(video_id: str, engine_version: str) -> dict | None` and `.put(chart: dict) -> None` (reads videoId + engineVersion out of the chart itself; silently skips charts with no videoId, e.g. file uploads).

- [ ] **Step 1: Write failing tests:**

`tests/api/test_videoid.py`:
```python
import pytest
from api.videoid import extract_video_id


@pytest.mark.parametrize("url,expected", [
    ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42", "dQw4w9WgXcQ"),
    ("https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"),
    ("https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://example.com/watch?v=nope", None),
    ("not a url", None),
])
def test_extract_video_id(url, expected):
    assert extract_video_id(url) == expected
```

`tests/api/test_cache.py`:
```python
from api.cache import ChartCache


def _chart(video_id="abc123XYZ_-", version="0.1.0"):
    return {
        "schemaVersion": 1,
        "source": {"kind": "youtube", "videoId": video_id, "duration": 1.0},
        "analysis": {"engineVersion": version, "createdAt": "2026-07-09T00:00:00Z"},
    }


def test_put_then_get_roundtrips(tmp_path):
    cache = ChartCache(str(tmp_path))
    cache.put(_chart())
    assert cache.get("abc123XYZ_-", "0.1.0")["schemaVersion"] == 1


def test_get_misses_on_other_version(tmp_path):
    cache = ChartCache(str(tmp_path))
    cache.put(_chart(version="0.1.0"))
    assert cache.get("abc123XYZ_-", "0.2.0") is None


def test_put_skips_chart_without_video_id(tmp_path):
    cache = ChartCache(str(tmp_path))
    cache.put({"source": {"kind": "file", "videoId": None, "duration": 1.0},
               "analysis": {"engineVersion": "0.1.0", "createdAt": "x"}})
    assert list(tmp_path.iterdir()) == []
```

- [ ] **Step 2: Run to verify failure** — `pytest tests/api/test_videoid.py tests/api/test_cache.py -v` → FAIL (modules missing).

- [ ] **Step 3: Implement:**

`api/videoid.py`:
```python
import re
from urllib.parse import parse_qs, urlparse

_ID = r"([A-Za-z0-9_-]{11})"
_PATH_PATTERNS = [re.compile(p + _ID) for p in (r"^/shorts/", r"^/embed/", r"^/")]


def extract_video_id(url: str) -> str | None:
    """Parse a YouTube URL into its 11-char video id, or None."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    host = (parsed.hostname or "").removeprefix("www.")
    if host in ("youtube.com", "m.youtube.com", "music.youtube.com"):
        v = parse_qs(parsed.query).get("v", [None])[0]
        if v and re.fullmatch(_ID, v):
            return v
        for pat in _PATH_PATTERNS[:2]:  # /shorts/, /embed/
            m = pat.match(parsed.path)
            if m:
                return m.group(1)
        return None
    if host == "youtu.be":
        m = _PATH_PATTERNS[2].match(parsed.path)  # /<id>
        return m.group(1) if m else None
    return None
```

`api/cache.py`:
```python
import json
import os


class ChartCache:
    """Disk cache of chart JSON, keyed by videoId + engineVersion."""

    def __init__(self, root: str):
        self.root = root
        os.makedirs(root, exist_ok=True)

    def _path(self, video_id: str, engine_version: str) -> str:
        return os.path.join(self.root, f"{video_id}@{engine_version}.json")

    def get(self, video_id: str, engine_version: str) -> dict | None:
        path = self._path(video_id, engine_version)
        if not os.path.exists(path):
            return None
        with open(path) as f:
            return json.load(f)

    def put(self, chart: dict) -> None:
        video_id = chart.get("source", {}).get("videoId")
        version = chart.get("analysis", {}).get("engineVersion")
        if not video_id or not version:
            return
        with open(self._path(video_id, version), "w") as f:
            json.dump(chart, f)
```

- [ ] **Step 4: Run to verify pass** — same command → PASS (11 tests).

- [ ] **Step 5: Commit** — `git add api/videoid.py api/cache.py tests/api/ && git commit -m "feat(api): videoId parsing and chart disk cache"`.

---

### Task 2: Job store

**Files:**
- Create: `api/jobs.py`
- Test: `tests/api/test_jobs.py`

**Interfaces:**
- Produces: `api.jobs.JobStore` — `submit(fn: Callable[[], dict]) -> str` (jobId), `get(job_id) -> {"status": "pending"|"done"|"error", "chart"?: dict, "error"?: str} | None`. Backed by `ThreadPoolExecutor(max_workers=1)` (the engine must not run concurrently — Demucs/TF are heavyweight). `submit_done(chart) -> str` creates an already-completed job (cache fast-path).

- [ ] **Step 1: Write failing test `tests/api/test_jobs.py`:**

```python
import threading
import time

from api.jobs import JobStore


def test_job_lifecycle_success():
    store = JobStore()
    release = threading.Event()

    def work():
        release.wait(timeout=5)
        return {"ok": True}

    job_id = store.submit(work)
    assert store.get(job_id)["status"] == "pending"
    release.set()
    deadline = time.time() + 5
    while store.get(job_id)["status"] == "pending" and time.time() < deadline:
        time.sleep(0.01)
    result = store.get(job_id)
    assert result["status"] == "done"
    assert result["chart"] == {"ok": True}


def test_job_error_is_reported():
    store = JobStore()
    job_id = store.submit(lambda: (_ for _ in ()).throw(RuntimeError("boom")))
    deadline = time.time() + 5
    while store.get(job_id)["status"] == "pending" and time.time() < deadline:
        time.sleep(0.01)
    result = store.get(job_id)
    assert result["status"] == "error"
    assert "boom" in result["error"]


def test_unknown_job_is_none():
    assert JobStore().get("nope") is None


def test_submit_done_is_immediately_done():
    store = JobStore()
    job_id = store.submit_done({"cached": True})
    assert store.get(job_id) == {"status": "done", "chart": {"cached": True}}
```

- [ ] **Step 2: Run to verify failure** — `pytest tests/api/test_jobs.py -v` → FAIL.

- [ ] **Step 3: Implement `api/jobs.py`:**

```python
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Callable


class JobStore:
    """Async analysis jobs: submit -> poll. Single worker serializes engine runs."""

    def __init__(self):
        self._executor = ThreadPoolExecutor(max_workers=1)
        self._jobs: dict[str, dict] = {}
        self._lock = threading.Lock()

    def _set(self, job_id: str, value: dict) -> None:
        with self._lock:
            self._jobs[job_id] = value

    def submit(self, fn: Callable[[], dict]) -> str:
        job_id = uuid.uuid4().hex
        self._set(job_id, {"status": "pending"})

        def run():
            try:
                chart = fn()
                self._set(job_id, {"status": "done", "chart": chart})
            except Exception as exc:  # surfaced to the client, not swallowed
                self._set(job_id, {"status": "error", "error": str(exc)})

        self._executor.submit(run)
        return job_id

    def submit_done(self, chart: dict) -> str:
        job_id = uuid.uuid4().hex
        self._set(job_id, {"status": "done", "chart": chart})
        return job_id

    def get(self, job_id: str) -> dict | None:
        with self._lock:
            return self._jobs.get(job_id)
```

- [ ] **Step 4: Run to verify pass** → PASS (4 tests).

- [ ] **Step 5: Commit** — `git add api/jobs.py tests/api/test_jobs.py && git commit -m "feat(api): async job store with single-worker executor"`.

---

### Task 3: Analyze endpoints

**Files:**
- Modify: `api/main.py`
- Test: `tests/api/test_main.py` (extend)

**Interfaces:**
- Consumes: `engine.pipeline.analyze`, `api.jobs.JobStore`, `api.cache.ChartCache`, `api.videoid.extract_video_id`.
- Produces:
  - `POST /analyze` — JSON `{"url": "..."}` OR multipart `file=...` → `202 {"jobId": "..."}`. URL flow: if `extract_video_id` hits the cache, return an already-done job. Uploads: save to a temp file, analyze, delete in `finally`.
  - `GET /analyze/{job_id}` → job dict; 404 if unknown.
  - `GET /chart/{video_id}` → cached chart or 404.
  - Cache dir configurable via `TABIT_CACHE_DIR` env (default `data/charts`); charts written to cache on job success.

- [ ] **Step 1: Extend `tests/api/test_main.py` with failing tests** (keep the health test):

```python
import time

import pytest
from fastapi.testclient import TestClient

import api.main as m
from api.main import app


FAKE_CHART = {
    "schemaVersion": 1,
    "source": {"kind": "youtube", "videoId": "dQw4w9WgXcQ", "title": "t", "duration": 2.0},
    "analysis": {"engineVersion": "0.1.0", "createdAt": "2026-07-09T00:00:00Z"},
    "key": {"tonic": "A", "mode": "minor", "confidence": 0.8},
    "scales": [], "tempo": {"bpm": 120.0}, "beats": [], "sections": [],
    "chords": [{"start": 0.0, "end": 2.0, "label": "Am", "root": "A",
                "quality": "min", "bass": "A", "confidence": 0.9}],
}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(m, "cache", m.ChartCache(str(tmp_path)))
    monkeypatch.setattr(m, "jobs", m.JobStore())
    monkeypatch.setattr(m, "_run_analysis", lambda src: FAKE_CHART)
    return TestClient(app)


def _poll_done(client, job_id, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        body = client.get(f"/analyze/{job_id}").json()
        if body["status"] != "pending":
            return body
        time.sleep(0.01)
    raise AssertionError("job never finished")


def test_analyze_url_flow(client):
    r = client.post("/analyze", json={"url": "https://youtu.be/dQw4w9WgXcQ"})
    assert r.status_code == 202
    body = _poll_done(client, r.json()["jobId"])
    assert body["status"] == "done"
    assert body["chart"]["source"]["videoId"] == "dQw4w9WgXcQ"


def test_analyze_caches_and_second_request_is_instant(client):
    r1 = client.post("/analyze", json={"url": "https://youtu.be/dQw4w9WgXcQ"})
    _poll_done(client, r1.json()["jobId"])
    # cached chart is now served directly
    assert client.get("/chart/dQw4w9WgXcQ").status_code == 200
    r2 = client.post("/analyze", json={"url": "https://youtu.be/dQw4w9WgXcQ"})
    body = client.get(f"/analyze/{r2.json()['jobId']}").json()
    assert body["status"] == "done"  # no polling needed - cache fast-path


def test_analyze_file_upload(client):
    r = client.post("/analyze", files={"file": ("song.wav", b"RIFFfake", "audio/wav")})
    assert r.status_code == 202
    body = _poll_done(client, r.json()["jobId"])
    assert body["status"] == "done"


def test_analyze_rejects_missing_input(client):
    assert client.post("/analyze", json={}).status_code == 422


def test_unknown_job_404(client):
    assert client.get("/analyze/nope").status_code == 404


def test_unknown_chart_404(client):
    assert client.get("/chart/nope").status_code == 404


def test_analysis_error_surfaces(client, monkeypatch):
    def boom(src):
        raise RuntimeError("yt-dlp exploded")
    monkeypatch.setattr(m, "_run_analysis", boom)
    r = client.post("/analyze", json={"url": "https://youtu.be/zzzzzzzzzzz"})
    body = _poll_done(client, r.json()["jobId"])
    assert body["status"] == "error"
    assert "yt-dlp" in body["error"]
```

- [ ] **Step 2: Run to verify failure** — `pytest tests/api/test_main.py -v` → new tests FAIL.

- [ ] **Step 3: Implement the endpoints in `api/main.py`** (replace the file):

```python
import os
import tempfile
from datetime import datetime, timezone

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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
async def analyze_submit(body: AnalyzeBody | None = None, file: UploadFile | None = File(None)):
    if file is not None:
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
```

Note: FastAPI treats `AnalyzeBody | None` + optional `File` correctly when the client sends either JSON or multipart; the 422 for `json={}` comes from pydantic validation of the missing `url` field. If FastAPI's body/file disambiguation misbehaves on the installed version, split into two code paths by inspecting `request.headers["content-type"]` — keep the same external contract and tests.

- [ ] **Step 4: Run to verify pass** — `pytest tests/api/ -v` → all API tests PASS.

- [ ] **Step 5: Manual smoke against the real engine** (uses the committed tone fixture; fast):

```bash
source .venv/bin/activate
uvicorn api.main:app --port 8000 &
sleep 2
curl -s -X POST localhost:8000/analyze -F "file=@tests/fixtures/tone_440.wav" | tee /tmp/job.json
# poll until done:
curl -s localhost:8000/analyze/$(python -c "import json;print(json.load(open('/tmp/job.json'))['jobId'])")
kill %1
```
Expected: 202 with a jobId; final poll returns `status: done` with a chart. This proves the API drives the real engine.

- [ ] **Step 6: Commit** — `git add api/main.py tests/api/test_main.py && git commit -m "feat(api): analyze endpoints with cache fast-path and upload support"`.

---

### Task 4: Web scaffolding

**Files:**
- Create: `web/` via Vite scaffold, then `web/index.html`, `web/vite.config.ts`, `web/src/index.css`, trimmed `web/src/App.tsx` + `web/src/main.tsx`
- Test: `web/src/App.test.tsx` (smoke render)

**Interfaces:**
- Produces: `npm run dev` serves the app on 5173 with `/api` proxied to 8000; `npm test` runs vitest; Fraunces font loaded; global CSS with the design's body background, selection color, and keyframes.

- [ ] **Step 1: Scaffold** —

```bash
cd web 2>/dev/null || (npm create vite@latest web -- --template react-ts && cd web)
npm install
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @testing-library/user-event
```

(If `npm create vite` prompts, use `--yes`. Delete the scaffold's demo assets: `src/assets`, `src/App.css`, logo imports.)

- [ ] **Step 2: `web/index.html`** — replace head contents to match the design helmet:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>tabIt — paste a song, follow the chords, play along</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500;1,9..144,600&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: `web/vite.config.ts`:**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: 'http://localhost:8000', rewrite: (p) => p.replace(/^\/api/, '') } } },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test-setup.ts' },
});
```

(Add `/// <reference types="vitest" />` at top if TS complains; create `src/test-setup.ts` containing `import '@testing-library/jest-dom';`. Add `"test": "vitest run"` to package.json scripts.)

- [ ] **Step 4: `web/src/index.css`** — global styles copied from the design helmet:

```css
* { box-sizing: border-box; }
body {
  margin: 0;
  background: oklch(0.972 0.008 85);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  color: oklch(0.28 0.02 70);
}
a { color: oklch(0.42 0.09 250); text-decoration: underline; text-decoration-color: oklch(0.75 0.06 250); text-underline-offset: 2px; }
a:hover { color: oklch(0.32 0.11 250); }
::selection { background: oklch(0.90 0.12 92); }

@keyframes tabit-pulse {
  0%, 100% { opacity: 0.25; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(-2px); }
}
@keyframes tabit-fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes tabit-sweep {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}

/* hover/active states from the design's style-hover/style-active attrs */
.btn-primary { transition: background 180ms ease-out, transform 180ms ease-out; }
.btn-primary:hover { background: oklch(0.36 0.03 70) !important; transform: translateY(-1px); }
.btn-primary:active { transform: translateY(0); }
.drop-label { transition: border-color 180ms ease-out, background 180ms ease-out; }
.drop-label:hover { border-color: oklch(0.55 0.02 70 / 0.8) !important; background: oklch(0.94 0.01 85 / 0.5); }
.round-btn:hover { background: oklch(0.94 0.01 85) !important; }
.quality-btn:hover { background: oklch(0.94 0.01 85); }
```

- [ ] **Step 5: Minimal `App.tsx` + smoke test:**

`web/src/App.tsx`:
```tsx
export default function App() {
  return <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>tabIt</div>;
}
```

`web/src/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders', () => {
  render(<App />);
  expect(screen.getByText(/tabIt/)).toBeInTheDocument();
});
```

- [ ] **Step 6: Verify** — `npm test` → 1 pass; `npm run dev` → page serves on 5173 (check with `curl -s localhost:5173 | head -5`, then stop it).

- [ ] **Step 7: Commit** — `git add web && git commit -m "feat(web): scaffold Vite React app with design tokens and proxy"`. (Ensure `web/node_modules` is gitignored — the root `.gitignore` already covers `node_modules/`.)

---

### Task 5: Music utils + chart types

**Files:**
- Create: `web/src/lib/types.ts`, `web/src/lib/music.ts`
- Test: `web/src/lib/music.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `Chart`, `ChordSegment`, `Key`, `Scale`, `Tempo`, `Source`, `JobState` — mirroring `engine/schema.py` exactly (see Global Constraints).
  - `music.ts`: `NOTE_ORDER`, `QUALITY_SUFFIX` (full engine map), `transposeRoot(root, semi)`, `formatLabel(root, quality, bass, semi)` (returns '—' for N), `findCurrentIndex(chords, t)` (binary search on `start`; a `t` past a segment's `end` but before the next `start` stays on that segment).

- [ ] **Step 1: Write failing tests `web/src/lib/music.test.ts`:**

```ts
import { describe, expect, test } from 'vitest';
import { transposeRoot, formatLabel, findCurrentIndex } from './music';
import type { ChordSegment } from './types';

const seg = (start: number, end: number, root = 'A', quality = 'min', bass = 'A'): ChordSegment =>
  ({ start, end, label: '', root, quality, bass, confidence: 0.9 });

describe('transposeRoot', () => {
  test('wraps around', () => {
    expect(transposeRoot('A', 3)).toBe('C');
    expect(transposeRoot('G#', 1)).toBe('A');
    expect(transposeRoot('C', -1)).toBe('B');
  });
  test('N passes through', () => expect(transposeRoot('N', 4)).toBe('N'));
});

describe('formatLabel', () => {
  test('qualities from engine map', () => {
    expect(formatLabel('A', 'min', 'A', 0)).toBe('Am');
    expect(formatLabel('G', 'dom7', 'G', 0)).toBe('G7');
    expect(formatLabel('B', 'hdim7', 'B', 0)).toBe('Bm7b5');
  });
  test('slash chords transpose the bass too', () => {
    expect(formatLabel('C', 'maj', 'G', 0)).toBe('C/G');
    expect(formatLabel('C', 'maj', 'G', 2)).toBe('D/A');
  });
  test('no-chord renders as an em dash', () => {
    expect(formatLabel('N', 'N', 'N', 0)).toBe('—');
    expect(formatLabel('N', 'N', 'N', 3)).toBe('—');
  });
});

describe('findCurrentIndex', () => {
  const chords = [seg(0.5, 2), seg(2, 4), seg(4.5, 6)];
  test('before first chord -> 0', () => expect(findCurrentIndex(chords, 0)).toBe(0));
  test('inside a segment', () => expect(findCurrentIndex(chords, 3)).toBe(1));
  test('in a gap stays on previous', () => expect(findCurrentIndex(chords, 4.2)).toBe(1));
  test('past the end -> last', () => expect(findCurrentIndex(chords, 99)).toBe(2));
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL (module missing).

- [ ] **Step 3: Implement:**

`web/src/lib/types.ts`:
```ts
export interface Source { kind: string; videoId?: string | null; title?: string | null; duration: number; }
export interface Analysis { engineVersion: string; createdAt: string; }
export interface Key { tonic: string; mode: string; confidence: number; }
export interface Scale { name: string; notes: string[]; }
export interface Tempo { bpm: number; }
export interface ChordSegment {
  start: number; end: number; label: string;
  root: string; quality: string; bass: string; confidence: number;
}
export interface Chart {
  schemaVersion: number; source: Source; analysis: Analysis;
  key: Key; scales: Scale[]; tempo: Tempo;
  beats: number[]; sections: unknown[]; chords: ChordSegment[];
}
export type JobState =
  | { status: 'pending' }
  | { status: 'done'; chart: Chart }
  | { status: 'error'; error: string };
```

`web/src/lib/music.ts`:
```ts
import type { ChordSegment } from './types';

export const NOTE_ORDER = ['A','A#','B','C','C#','D','D#','E','F','F#','G','G#'];

// Mirrors engine/schema.py QUALITY_SUFFIX exactly.
export const QUALITY_SUFFIX: Record<string, string> = {
  maj: '', min: 'm', dom7: '7', maj7: 'maj7', min7: 'm7',
  dim: 'dim', aug: 'aug', sus2: 'sus2', sus4: 'sus4', '6': '6',
  min6: 'm6', hdim7: 'm7b5', dim7: 'dim7', minmaj7: 'mMaj7',
  '9': '9', maj9: 'maj9', min9: 'm9',
};

export function transposeRoot(root: string, semi: number): string {
  const idx = NOTE_ORDER.indexOf(root);
  if (idx < 0) return root; // includes 'N'
  return NOTE_ORDER[(idx + semi + 1200) % 12];
}

export function formatLabel(root: string, quality: string, bass: string, semi: number): string {
  if (quality === 'N' || root === 'N') return '—';
  const r = transposeRoot(root, semi);
  const suffix = QUALITY_SUFFIX[quality] ?? quality;
  const b = bass ? transposeRoot(bass, semi) : null;
  return b && b !== r ? `${r}${suffix}/${b}` : `${r}${suffix}`;
}

/** Last segment whose start <= t (clamped to [0, length-1]). Gaps stay on the previous segment. */
export function findCurrentIndex(chords: ChordSegment[], t: number): number {
  if (!chords.length) return 0;
  let lo = 0, hi = chords.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (chords[mid].start <= t) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return ans;
}
```

- [ ] **Step 4: Run to verify pass** — `npm test` → PASS.

- [ ] **Step 5: Commit** — `git add web/src/lib && git commit -m "feat(web): chart types and music utils mirroring the engine contract"`.

---

### Task 6: API client + overrides store

**Files:**
- Create: `web/src/lib/api.ts`, `web/src/lib/overrides.ts`
- Test: `web/src/lib/api.test.ts`

**Interfaces:**
- Produces:
  - `api.ts`: `analyzeUrl(url) -> Promise<string /*jobId*/>`, `analyzeFile(file) -> Promise<string>`, `pollJob(jobId, {intervalMs=1500, onTick?}) -> Promise<Chart>` (resolves on done, rejects with the error string on error), all hitting `/api/...`.
  - `overrides.ts`: `loadOverrides(chartKey) -> Record<number, {root,quality,bass}>`, `saveOverrides(chartKey, overrides)`, `chartKey(chart) -> string` (videoId if present, else `title:duration`). Persisted in `localStorage` under `tabit:overrides:<key>`.

- [ ] **Step 1: Write failing tests `web/src/lib/api.test.ts`** (mock `fetch`):

```ts
import { afterEach, expect, test, vi } from 'vitest';
import { analyzeUrl, pollJob } from './api';

afterEach(() => vi.restoreAllMocks());

test('analyzeUrl posts and returns jobId', async () => {
  const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ jobId: 'j1' }), { status: 202 }));
  await expect(analyzeUrl('https://youtu.be/x')).resolves.toBe('j1');
  expect(mock).toHaveBeenCalledWith('/api/analyze', expect.objectContaining({ method: 'POST' }));
});

test('pollJob resolves when done', async () => {
  const chart = { schemaVersion: 1 };
  const responses = [
    new Response(JSON.stringify({ status: 'pending' })),
    new Response(JSON.stringify({ status: 'done', chart })),
  ];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => responses.shift()!);
  await expect(pollJob('j1', { intervalMs: 1 })).resolves.toEqual(chart);
});

test('pollJob rejects on error status', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ status: 'error', error: 'yt-dlp exploded' })));
  await expect(pollJob('j1', { intervalMs: 1 })).rejects.toThrow('yt-dlp exploded');
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement:**

`web/src/lib/api.ts`:
```ts
import type { Chart, JobState } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function toJson(res: Response) {
  if (!res.ok && res.status !== 202) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function analyzeUrl(url: string): Promise<string> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return (await toJson(res)).jobId;
}

export async function analyzeFile(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/analyze', { method: 'POST', body: form });
  return (await toJson(res)).jobId;
}

export async function pollJob(
  jobId: string,
  opts: { intervalMs?: number; onTick?: () => void } = {},
): Promise<Chart> {
  const interval = opts.intervalMs ?? 1500;
  for (;;) {
    const state = (await toJson(await fetch(`/api/analyze/${jobId}`))) as JobState;
    if (state.status === 'done') return state.chart;
    if (state.status === 'error') throw new Error(state.error);
    opts.onTick?.();
    await sleep(interval);
  }
}
```

`web/src/lib/overrides.ts`:
```ts
import type { Chart } from './types';

export type Override = { root: string; quality: string; bass: string };
export type Overrides = Record<number, Override>;

export function chartKey(chart: Chart): string {
  return chart.source.videoId ?? `${chart.source.title ?? 'file'}:${chart.source.duration}`;
}

export function loadOverrides(key: string): Overrides {
  try {
    return JSON.parse(localStorage.getItem(`tabit:overrides:${key}`) ?? '{}');
  } catch {
    return {};
  }
}

export function saveOverrides(key: string, overrides: Overrides): void {
  localStorage.setItem(`tabit:overrides:${key}`, JSON.stringify(overrides));
}
```

- [ ] **Step 4: Run to verify pass** — `npm test` → PASS.

- [ ] **Step 5: Commit** — `git add web/src/lib && git commit -m "feat(web): API client with job polling and persistent chord overrides"`.

---

### Task 7: App state machine + Landing + Analyzing screens

**Files:**
- Modify: `web/src/App.tsx`
- Create: `web/src/screens/Landing.tsx`, `web/src/screens/Analyzing.tsx`
- Test: `web/src/App.test.tsx` (extend)

**Interfaces:**
- Consumes: `analyzeUrl`, `analyzeFile`, `pollJob` from Task 6.
- Produces:
  - `App.tsx` state: `{stage: 'landing'|'analyzing'|'sheet', chart: Chart|null, mediaFile: File|null, error: string|null}`. Submitting a URL or file → `analyzing`, then `sheet` on success; on failure → back to `landing` with an error banner. `mediaFile` is retained for local playback (Task 8).
  - `Landing.tsx` props: `{onSubmitUrl(url), onSubmitFile(file), error?: string|null}`.
  - `Analyzing.tsx`: no props (pure visual).

**Design parity requirements** (translate from `docs/design/TabIt.dc.html`, Landing + Analyzing `sc-if` blocks — copy the inline styles verbatim into JSX `style` objects; hover styles use the classes from Task 4):
- Landing: Fraunces italic 56px wordmark; subtitle; 560px raised paper card with red margin line at left 44px; uppercase "YouTube link" label; Fraunces 20px underlined input (Enter submits); dark "Find the chords" button (`.btn-primary`) + "no account, no clutter — paste and go"; "or" divider; dashed file-drop label (`.drop-label`) with hidden `<input type="file" accept="audio/*">`. **No demo-mode footnote.** NEW (not in prototype): when `error` is set, a small banner above the card: muted red text `oklch(0.55 0.12 25)`, copy: `Couldn't analyze that — {error}. Try again, or drop an audio file instead.`
- Analyzing: centered Fraunces italic 32px wordmark; "Listening for chords, key and scale" with the three pulsing dots (`tabit-pulse`, staggered delays); the 220px sweep bar (`tabit-sweep`). Add one extra muted line under the bar: `first listen takes a minute or two — after that it's instant` (sets expectation for cold-cache analyses).

- [ ] **Step 1: Extend `web/src/App.test.tsx` with failing tests** (mock the api module):

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import App from './App';
import * as api from './lib/api';

const FAKE_CHART = {
  schemaVersion: 1,
  source: { kind: 'youtube', videoId: 'x', title: 'Song', duration: 10 },
  analysis: { engineVersion: '0.1.0', createdAt: 'now' },
  key: { tonic: 'A', mode: 'minor', confidence: 0.8 },
  scales: [{ name: 'A minor pentatonic', notes: [] }],
  tempo: { bpm: 120 }, beats: [], sections: [],
  chords: [{ start: 0, end: 5, label: 'Am', root: 'A', quality: 'min', bass: 'A', confidence: 0.9 }],
};

test('url submit walks landing -> analyzing -> sheet', async () => {
  vi.spyOn(api, 'analyzeUrl').mockResolvedValue('j1');
  vi.spyOn(api, 'pollJob').mockResolvedValue(FAKE_CHART as never);
  render(<App />);
  await userEvent.type(screen.getByPlaceholderText(/youtube.com/), 'https://youtu.be/x');
  await userEvent.click(screen.getByRole('button', { name: /find the chords/i }));
  await waitFor(() => expect(screen.getByText(/A minor pentatonic/)).toBeInTheDocument());
});

test('analysis failure returns to landing with the error', async () => {
  vi.spyOn(api, 'analyzeUrl').mockResolvedValue('j1');
  vi.spyOn(api, 'pollJob').mockRejectedValue(new Error('yt-dlp exploded'));
  render(<App />);
  await userEvent.type(screen.getByPlaceholderText(/youtube.com/), 'https://youtu.be/x');
  await userEvent.click(screen.getByRole('button', { name: /find the chords/i }));
  await waitFor(() => expect(screen.getByText(/yt-dlp exploded/)).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /find the chords/i })).toBeInTheDocument();
});
```

(The sheet screen doesn't exist yet — have App render a placeholder `<div>` for stage 'sheet' that shows `chart.scales[0].name` so the first test passes; Task 9 replaces it.)

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `App.tsx`, `Landing.tsx`, `Analyzing.tsx`** per the parity requirements above. App logic:

```tsx
// App.tsx core logic (screens carry the design markup)
const [stage, setStage] = useState<'landing' | 'analyzing' | 'sheet'>('landing');
const [chart, setChart] = useState<Chart | null>(null);
const [mediaFile, setMediaFile] = useState<File | null>(null);
const [error, setError] = useState<string | null>(null);

async function run(submit: () => Promise<string>, file: File | null) {
  setError(null);
  setMediaFile(file);
  setStage('analyzing');
  try {
    const chart = await pollJob(await submit());
    setChart(chart);
    setStage('sheet');
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
    setStage('landing');
  }
}
const onSubmitUrl = (url: string) => run(() => analyzeUrl(url), null);
const onSubmitFile = (file: File) => run(() => analyzeFile(file), file);
const onBack = () => { setStage('landing'); setChart(null); setMediaFile(null); setError(null); };
```

- [ ] **Step 4: Run to verify pass** — `npm test` → PASS. Also visually verify against the design: `npm run dev`, open 5173, compare Landing and (briefly) Analyzing against `docs/design/TabIt.dc.html` opened in a browser.

- [ ] **Step 5: Commit** — `git add web/src && git commit -m "feat(web): landing and analyzing screens with real analyze flow"`.

---

### Task 8: Playback layer

**Files:**
- Create: `web/src/playback/usePlaybackTime.ts`, `web/src/playback/YouTubePlayer.tsx`, `web/src/playback/AudioPlayer.tsx`

**Interfaces:**
- Produces:
  - `PlaybackSource = { getCurrentTime(): number }` (exported from `usePlaybackTime.ts`).
  - `usePlaybackTime(source: PlaybackSource | null): number` — rAF loop throttled to ~10 Hz (the design's 100ms tick), returns current time in seconds; updates state only when it moves >0.05s; cancels on unmount/null source.
  - `<YouTubePlayer videoId onReady={(src: PlaybackSource) => void} />` — loads `https://www.youtube.com/iframe_api` once (module-level promise resolving on `onYouTubeIframeAPIReady`), mounts a player in a 16/9 box (design's 300px-wide black card), calls `onReady` with a source wrapping `player.getCurrentTime()`. Destroys the player on unmount.
  - `<AudioPlayer file onReady={(src) => void} />` — object-URL `<audio controls>` styled to sit where the video card sits; source wraps `audio.currentTime`; revokes the object URL on unmount.

- [ ] **Step 1: Implement `usePlaybackTime.ts`:**

```ts
import { useEffect, useState } from 'react';

export interface PlaybackSource { getCurrentTime(): number; }

export function usePlaybackTime(source: PlaybackSource | null): number {
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!source) return;
    let rafId = 0;
    let last = 0;
    let lastTime = -1;
    const tick = (ts: number) => {
      if (ts - last > 100) {
        last = ts;
        const t = source.getCurrentTime() || 0;
        if (Math.abs(t - lastTime) > 0.05) { lastTime = t; setTime(t); }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [source]);
  return time;
}
```

- [ ] **Step 2: Implement `YouTubePlayer.tsx`** — module-level `let apiPromise: Promise<void> | null`; `loadYouTubeApi()` injects the script tag once and resolves on `window.onYouTubeIframeAPIReady`; component `useEffect` creates `new YT.Player(mountEl, { videoId, playerVars: { modestbranding: 1, rel: 0 }, events: { onReady } })`, and on unmount calls `player.destroy()` in a try/catch. Declare minimal `YT` types locally (`declare global { interface Window { YT?: ...; onYouTubeIframeAPIReady?: () => void } }`) — do not add @types packages.

- [ ] **Step 3: Implement `AudioPlayer.tsx`** — `const url = useMemo(() => URL.createObjectURL(file), [file])`; `<audio controls src={url} ref={...}>` in a paper-card box matching the design's player slot; `onReady({ getCurrentTime: () => audioRef.current?.currentTime ?? 0 })` once mounted; `useEffect` cleanup revokes the URL.

- [ ] **Step 4: Typecheck + tests still green** — `npx tsc --noEmit && npm test`. (This task is exercised by Task 9's component tests and the Task 11 end-to-end; no isolated unit tests for browser-API wrappers.)

- [ ] **Step 5: Commit** — `git add web/src/playback && git commit -m "feat(web): playback sources (YouTube IFrame + local audio) and time hook"`.

---

### Task 9: Sheet screen

**Files:**
- Create: `web/src/screens/Sheet.tsx`
- Modify: `web/src/App.tsx` (replace the placeholder)
- Test: `web/src/screens/Sheet.test.tsx`

**Interfaces:**
- Consumes: `Chart`, `findCurrentIndex`, `formatLabel`, `transposeRoot`, `usePlaybackTime`, players from Task 8, `Overrides` (read-only here; editing arrives in Task 10).
- Produces: `<Sheet chart mediaFile onBack />` implementing the design's Chord-sheet screen.

**Design parity requirements** (from the `isSheet` block of `docs/design/TabIt.dc.html` — copy inline styles verbatim; behavior from its `renderVals`):
- Header: Fraunces italic wordmark + dashed-underline "‹ new song" link (calls `onBack`) + muted `chart.source.title` right-aligned.
- Player column: 300px black card, 16/9 — `YouTubePlayer` when `chart.source.videoId`, else `AudioPlayer` with `mediaFile`.
- Chips: Key (`transposeRoot(tonic, transpose) + ' ' + mode`), Tempo (`Math.round(bpm) + ' bpm'`), "Scales to solo with" (`scales.map(s => s.name).join(' · ')`).
- Transpose row: −/+ round buttons (`.round-btn`), clamped ±6, label `no shift` / `+n st` / `−n st`.
- The sheet: raised paper card, red margin line at left 52px, scroll container (max-height 420px), rows of 4 chords in a grid, row bottom-border as the ruled line.
- Chord cells (from the design's `decorated` mapping): current → amber marker div behind (rotate −0.6deg, radius `3px 8px 5px 9px`, `oklch(0.90 0.12 92)`), font-size 30px vs 26px; next → 2px solid graphite underline; low confidence (`< 0.75`, not edited) → muted color + 1.5px dotted underline; `quality === 'N'` → muted '—', not a button.
- Auto-scroll: keep the current row vertically centered in the scroll container (design's `offsetTop` math, only when drift > 8px), `scroll-behavior: smooth`.
- Footer: `Now: <b>{label}</b> · Next: <b>{label}</b> in {s}s` (Fraunces bolds).

- [ ] **Step 1: Write failing test `web/src/screens/Sheet.test.tsx`** — render `Sheet` with a fixture chart (5 chords: Am, F, C low-confidence 0.6, G, N) and a fake `PlaybackSource` you can set the time on (inject by mocking `usePlaybackTime` — `vi.mock('../playback/usePlaybackTime')` returning a controllable value). Assert:
  - all chord labels render, C is present, N renders as '—';
  - with time inside F's segment, the F cell has the highlight marker (query by test id `data-testid="marker"` inside the current cell) and the footer shows `Now: F`;
  - transpose `+2` relabels Am → Bm (click the + button twice).

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import Sheet from './Sheet';
import * as playback from '../playback/usePlaybackTime';

const chart = {
  schemaVersion: 1,
  source: { kind: 'youtube', videoId: 'x', title: 'Song', duration: 20 },
  analysis: { engineVersion: '0.1.0', createdAt: 'now' },
  key: { tonic: 'A', mode: 'minor', confidence: 0.8 },
  scales: [{ name: 'A minor pentatonic', notes: [] }],
  tempo: { bpm: 120 }, beats: [], sections: [],
  chords: [
    { start: 0, end: 4, label: 'Am', root: 'A', quality: 'min', bass: 'A', confidence: 0.9 },
    { start: 4, end: 8, label: 'F', root: 'F', quality: 'maj', bass: 'F', confidence: 0.8 },
    { start: 8, end: 12, label: 'C', root: 'C', quality: 'maj', bass: 'C', confidence: 0.6 },
    { start: 12, end: 16, label: 'G', root: 'G', quality: 'maj', bass: 'G', confidence: 0.85 },
    { start: 16, end: 20, label: 'N', root: 'N', quality: 'N', bass: 'N', confidence: 0.8 },
  ],
};

test('renders chords, marks current, N is a dash', () => {
  vi.spyOn(playback, 'usePlaybackTime').mockReturnValue(5); // inside F
  render(<Sheet chart={chart as never} mediaFile={null} onBack={() => {}} />);
  expect(screen.getByText('Am')).toBeInTheDocument();
  expect(screen.getByText('—')).toBeInTheDocument();
  expect(screen.getByTestId('marker').parentElement).toHaveTextContent('F');
  expect(screen.getByText(/Now:/).parentElement).toHaveTextContent('F');
});

test('transpose relabels', async () => {
  vi.spyOn(playback, 'usePlaybackTime').mockReturnValue(0);
  render(<Sheet chart={chart as never} mediaFile={null} onBack={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /transpose up/i }));
  await userEvent.click(screen.getByRole('button', { name: /transpose up/i }));
  expect(screen.getByText('Bm')).toBeInTheDocument();
});
```

(YouTubePlayer will try to load the IFrame API under jsdom — stub it: `vi.mock('../playback/YouTubePlayer', () => ({ default: () => <div data-testid="yt" /> }))`.)

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `Sheet.tsx`** per the parity requirements. State: `transpose` (number), player source (`useState<PlaybackSource | null>`); `time = usePlaybackTime(source)`; `currentIndex = findCurrentIndex(chart.chords, time)`; rows = chunks of 4; row refs in a `useRef<Record<number, HTMLDivElement>>`; auto-scroll in a `useEffect` on `currentIndex`. Replace App's placeholder with `<Sheet chart={chart} mediaFile={mediaFile} onBack={onBack} />`.

- [ ] **Step 4: Run to verify pass** — `npm test` → PASS; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit** — `git add web/src && git commit -m "feat(web): synced chord sheet with highlight, lookahead and transpose"`.

---

### Task 10: Chord editing (fix-this-chord popover + persistence)

**Files:**
- Create: `web/src/screens/EditPopover.tsx`
- Modify: `web/src/screens/Sheet.tsx`
- Test: `web/src/screens/Sheet.test.tsx` (extend)

**Interfaces:**
- Consumes: `Overrides`/`loadOverrides`/`saveOverrides`/`chartKey` (Task 6), `transposeRoot`, `formatLabel`.
- Produces: clicking a (non-N) chord toggles the popover; root −/+ nudge, quality options row (`maj min 7 maj7 m7 sus2 sus4` displayed; values `maj min dom7 maj7 min7 sus2 sus4`), "reset to detected" when edited. Overrides live in Sheet state, persisted via `saveOverrides` on every change, loaded on mount by `chartKey(chart)`. Edited chords: red dot at top-right of the cell (design), `confidence` treated as 1 (never dimmed). A fixed full-screen transparent backdrop (design's `hasEditingChord` block) closes the popover on outside click.

**Design parity:** popover markup/styles verbatim from the design's `chord.isEditing` block (220px raised card, "Fix this chord" label, × close, −/+ around the Fraunces 20px label, quality buttons `.quality-btn`, underlined "reset to detected").

- [ ] **Step 1: Extend `Sheet.test.tsx` with failing tests:**

```tsx
test('editing a chord persists an override', async () => {
  vi.spyOn(playback, 'usePlaybackTime').mockReturnValue(0);
  localStorage.clear();
  render(<Sheet chart={chart as never} mediaFile={null} onBack={() => {}} />);
  await userEvent.click(screen.getByText('F'));                        // open popover
  await userEvent.click(screen.getByRole('button', { name: 'm7' }));   // change quality
  expect(screen.getByText('Fm7')).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('tabit:overrides:x')!)['1'].quality).toBe('min7');
});

test('reset restores the detected chord', async () => {
  vi.spyOn(playback, 'usePlaybackTime').mockReturnValue(0);
  render(<Sheet chart={chart as never} mediaFile={null} onBack={() => {}} />);
  await userEvent.click(screen.getByText('Fm7'));
  await userEvent.click(screen.getByRole('button', { name: /reset to detected/i }));
  expect(screen.getByText('F')).toBeInTheDocument();
  expect(localStorage.getItem('tabit:overrides:x')).toBe('{}');
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement** — `EditPopover` gets `{label, onRootUp, onRootDown, onQuality, onReset, onClose, edited}`; Sheet owns `overrides` state + `editingIndex`, computes `effectiveChord(i)` (design logic: override spread over base, confidence 1), persists with `saveOverrides` in the state setter, loads once with `loadOverrides(chartKey(chart))`.

- [ ] **Step 4: Run to verify pass** — `npm test` → all web tests PASS.

- [ ] **Step 5: Commit** — `git add web/src && git commit -m "feat(web): fix-this-chord popover with persistent local overrides"`.

---

### Task 11: End-to-end verification + docs

**Files:**
- Modify: `README.md`
- No new code except fixes surfaced by verification.

- [ ] **Step 1: Full test sweep** —

```bash
source .venv/bin/activate && pytest -q && pytest -q -m integration
cd web && npx tsc --noEmit && npm test && npm run build
```
Expected: everything green, production build succeeds.

- [ ] **Step 2: Real end-to-end run** —

```bash
source .venv/bin/activate
uvicorn api.main:app --port 8000 &
cd web && npm run dev &
```
Then exercise the real flow in a browser (or with the run/verify skill): paste `https://www.youtube.com/watch?v=HNBCVM4KbUM` (Three Little Birds — already cache-warm from engine testing only if the cache dir is shared; otherwise expect the 1–2 min cold analysis), confirm: analyzing screen appears → sheet renders with key **A major** → video plays and the amber marker tracks the song → next-chord underline moves ahead → transpose relabels → clicking a chord opens the popover, an edit sticks after reload (localStorage) → "‹ new song" returns to landing. Then submit the same URL again and confirm the sheet appears near-instantly (cache fast-path). Record observations.

- [ ] **Step 3: Update `README.md`** — mark sub-project 2 tasks complete, add run instructions:

```markdown
### Run the web app

    # terminal 1 — API
    source .venv/bin/activate
    uvicorn api.main:app --port 8000

    # terminal 2 — web
    cd web && npm install && npm run dev   # http://localhost:5173
```

- [ ] **Step 4: Commit** — `git add README.md && git commit -m "docs: web app run instructions and progress"`.

---

## Self-Review

**Spec/design coverage:**
- Landing (URL + file input, error state) → Task 7. Analyzing screen → Task 7. ✅
- Synced sheet: current highlight, next underline, auto-scroll, now/next footer → Task 9. ✅
- Key/tempo/scales chips → Task 9. Transpose (structural relabel) → Tasks 5+9. ✅
- Honest confidence (<0.75 dimmed + dotted) → Task 9; edited chords exempt → Task 10. ✅
- Click-to-fix popover + local persistence → Task 10. ✅
- YouTube IFrame sync → Task 8; file uploads get local `<audio>` sync (design gap, resolved) → Task 8. ✅
- API: submit/poll/cached-chart endpoints, single-worker jobs, disk cache, upload deletion → Tasks 0–3. ✅
- Design demo-mode artifacts removed (fake timeout, demo footnote, hardcoded chart) → Tasks 3, 7. ✅
- `N` segments (real charts have them; the demo didn't) → Tasks 5, 9. ✅

**Placeholder scan:** all code steps carry complete code; screen tasks bind to the committed design file with enumerated parity requirements — no TBDs. ✅

**Type consistency:** `Chart`/`ChordSegment` fields match `engine/schema.py`; `formatLabel(root, quality, bass, semi)` signature consistent across Tasks 5/9/10; `PlaybackSource.getCurrentTime()` consistent across Tasks 8/9; `JobState` matches the API's `{status, chart?, error?}` shape from Task 2/3. ✅

**Known risks:** FastAPI JSON-body + optional-file disambiguation (Task 3 carries a fallback strategy); YouTube IFrame embedding can be blocked for some videos (embed-restricted) — surfaces as a dead player, acceptable for the demo and noted for the extension cycle; first cold analysis latency is set as an expectation in the Analyzing copy.
