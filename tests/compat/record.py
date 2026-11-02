"""Record the helper API's JSON responses for one version, as compatibility fixtures.

    python -m tests.compat.record <version>   (from the repo root)

writes tests/compat/fixtures/<version>/<name>.json for each name in build_responses().
Run it at release time (docs/RELEASING.md); tests/compat/test_compat.py then checks that
every later API is a superset of what was recorded.
"""
import json
import sys
import tempfile
import threading
import time
from pathlib import Path

from fastapi.testclient import TestClient

import api.main as m
from engine import engine_version
from engine.schema import Analysis, Chart, ChordSegment, Key, Meter, Scale, Source, Tempo

BASE = "http://localhost:28224"  # the guard only admits loopback Hosts
VIDEO_ID = "dQw4w9WgXcQ"
FIXTURES = Path(__file__).parent / "fixtures"

def _fake_chart() -> dict:
    """A chart built by the engine's own schema model, so the recorded shape is the shape the
    engine really emits (an engine that drops a field drops it here too)."""
    return Chart(
        source=Source(kind="youtube", videoId=VIDEO_ID, title="t", duration=2.0),
        analysis=Analysis(engineVersion=engine_version(), createdAt="2026-07-09T00:00:00Z"),
        key=Key(tonic="A", mode="minor", confidence=0.8),
        scales=[Scale(name="A minor pentatonic", notes=["A", "C", "D", "E", "G"])],
        tempo=Tempo(bpm=120.0),
        beats=[0.0, 0.5, 1.0, 1.5],
        chords=[ChordSegment(start=0.0, end=2.0, label="Am", root="A", quality="min",
                             bass="A", confidence=0.9)],
        meter=Meter(beatsPerBar=4, confidence=0.9),
        downbeats=[0.0],
    ).model_dump()


def _wait_for(predicate, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(0.01)
    raise AssertionError("timed out waiting for the API")


def build_responses() -> dict[str, object]:
    """Drive the real FastAPI app in-process with the analysis stubbed, and return the
    JSON body of each response the extension reads."""
    release = threading.Event()

    def fake_run_analysis(src, on_step=None):
        if on_step:
            on_step("analyzing")
        release.wait(5.0)
        return _fake_chart()

    saved = (m.cache, m.jobs, m._run_analysis)
    with tempfile.TemporaryDirectory() as tmp:
        m.cache, m.jobs, m._run_analysis = m.ChartCache(tmp), m.JobStore(), fake_run_analysis
        try:
            client = TestClient(m.app, base_url=BASE)
            out: dict[str, object] = {"health": client.get("/health").json()}
            submit = client.post("/analyze", json={"url": f"https://youtu.be/{VIDEO_ID}"})
            out["analyze-submit"] = submit.json()
            job = f"/analyze/{submit.json()['jobId']}"
            out["job-pending"] = _wait_for(lambda: _body_if(client, job, lambda b: b["status"] == "pending" and "step" in b))
            release.set()
            out["job-done"] = _wait_for(lambda: _body_if(client, job, lambda b: b["status"] == "done"))
            out["chart"] = client.get(f"/chart/{VIDEO_ID}").json()
            return out
        finally:
            release.set()
            m.cache, m.jobs, m._run_analysis = saved


def _body_if(client, path, predicate):
    body = client.get(path).json()
    return body if predicate(body) else None


def main(version: str) -> None:
    target = FIXTURES / version
    target.mkdir(parents=True, exist_ok=True)
    for name, body in build_responses().items():
        (target / f"{name}.json").write_text(json.dumps(body, indent=2, sort_keys=True) + "\n")
    print(f"recorded {target}")


if __name__ == "__main__":
    main(sys.argv[1])
