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
