import threading
import time

import pytest
from fastapi.testclient import TestClient

import api.main as m
from api.main import ENGINE_VERSION, app


def test_chord_model_is_a_process_singleton(monkeypatch):
    """Model weights must load once per process, not once per analysis job."""
    created = []

    class FakeModel:
        def __init__(self):
            created.append(1)

    monkeypatch.setattr(m, "CremaChordModel", FakeModel)
    monkeypatch.setattr(m, "_chord_model", None)

    a = m._get_chord_model()
    b = m._get_chord_model()
    assert a is b
    assert len(created) == 1


def test_run_analysis_uses_shared_chord_model(monkeypatch):
    sentinel = object()
    monkeypatch.setattr(m, "_get_chord_model", lambda: sentinel)

    seen = {}
    import engine.pipeline

    class FakeChart:
        def model_dump(self):
            return {"ok": True}

    def fake_analyze(src, *, created_at, chord_model=None, **kwargs):
        seen["chord_model"] = chord_model
        return FakeChart()

    monkeypatch.setattr(engine.pipeline, "analyze", fake_analyze)

    assert m._run_analysis("whatever") == {"ok": True}
    assert seen["chord_model"] is sentinel


def test_startup_warms_models_in_background(monkeypatch):
    """First request shouldn't pay model-load latency: server startup kicks off
    a background warmup (and must not block serving while it runs)."""
    warmed = threading.Event()
    monkeypatch.setattr(m, "_warm_models", lambda: warmed.set())

    with TestClient(app) as client:
        assert client.get("/health").status_code == 200  # serving before warm
        assert warmed.wait(2.0)


FAKE_CHART = {
    "schemaVersion": 1,
    "source": {"kind": "youtube", "videoId": "dQw4w9WgXcQ", "title": "t", "duration": 2.0},
    "analysis": {"engineVersion": ENGINE_VERSION, "createdAt": "2026-07-09T00:00:00Z"},
    "key": {"tonic": "A", "mode": "minor", "confidence": 0.8},
    "scales": [], "tempo": {"bpm": 120.0}, "beats": [], "sections": [],
    "chords": [{"start": 0.0, "end": 2.0, "label": "Am", "root": "A",
                "quality": "min", "bass": "A", "confidence": 0.9}],
}


def test_health():
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["engineVersion"]


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


def test_analyze_rejects_non_youtube_url(client):
    r = client.post("/analyze", json={"url": "/etc/passwd"})
    assert r.status_code == 422
    r2 = client.post("/analyze", json={"url": "https://example.com/watch?v=dQw4w9WgXcQ"})
    assert r2.status_code == 422


def test_analyze_rejects_oversized_upload(client, monkeypatch):
    monkeypatch.setattr(m, "MAX_UPLOAD_BYTES", 4)
    r = client.post("/analyze", files={"file": ("song.wav", b"0123456789", "audio/wav")})
    assert r.status_code == 413


def test_multipart_file_without_filename_is_422(client):
    # a plain text form part named "file" (no filename) must not crash the endpoint
    r = client.post("/analyze", files={"file": (None, "hello")})
    assert r.status_code == 422


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
