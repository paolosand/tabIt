import glob
import tempfile

import pytest
from fastapi.testclient import TestClient

import api.main as m
from api.guard import LocalGuardMiddleware, host_is_allowed, origin_is_allowed
from api.main import app
from engine import engine_version

BASE = "http://localhost:28224"
EVIL = {"Origin": "https://evil.example"}
EXT = {"Origin": "chrome-extension://abcdefghijklmnop"}


@pytest.mark.parametrize("host", [
    "localhost", "localhost:28224", "LOCALHOST:28224", "127.0.0.1:28224",
    "[::1]:28224", "localhost:5173",
])
def test_host_allowed(host):
    assert host_is_allowed(host)


@pytest.mark.parametrize("host", [
    None, "", "evil.com", "localhost.evil.com", "127.0.0.1.evil.com",
    "localhost:28224@evil.com", "localhost:abc", "[::1", "localhost:",
])
def test_host_rejected(host):
    assert not host_is_allowed(host)


@pytest.mark.parametrize("method", ["GET", "POST", "PUT", "DELETE", "OPTIONS"])
def test_origin_none_always_allowed(method):
    assert origin_is_allowed(None, method)


@pytest.mark.parametrize("origin", ["chrome-extension://abcdef", "http://localhost:5173"])
@pytest.mark.parametrize("method", ["GET", "POST", "PUT", "DELETE"])
def test_origin_trusted_allowed(origin, method):
    assert origin_is_allowed(origin, method)


@pytest.mark.parametrize("method", ["GET", "HEAD", "OPTIONS"])
def test_origin_foreign_allowed_for_safe_methods(method):
    assert origin_is_allowed("https://evil.example", method)


@pytest.mark.parametrize("method", ["POST", "PUT", "DELETE", "PATCH"])
@pytest.mark.parametrize("origin", ["https://evil.example", "http://localhost:5173.evil.com",
                                    "http://localhost:3000", "null", ""])
def test_origin_foreign_rejected_for_unsafe_methods(origin, method):
    assert not origin_is_allowed(origin, method)


@pytest.fixture
def ran(tmp_path, monkeypatch):
    monkeypatch.setattr(m, "cache", m.ChartCache(str(tmp_path)))
    monkeypatch.setattr(m, "jobs", m.JobStore())
    calls = []
    monkeypatch.setattr(m, "_run_analysis",
                        lambda src, on_step=None: calls.append(src) or {})
    return calls


def test_post_analyze_from_web_origin_is_403(ran):
    r = TestClient(app, base_url=BASE).post(
        "/analyze", json={"url": "https://youtu.be/dQw4w9WgXcQ"}, headers=EVIL)
    assert r.status_code == 403 and r.json() == {"detail": "forbidden"}
    assert ran == []


def test_post_upload_multipart_from_web_origin_is_403(ran):
    before = set(glob.glob(tempfile.gettempdir() + "/tabit_upload_*"))
    r = TestClient(app, base_url=BASE).post(
        "/analyze", files={"file": ("a.mp3", b"x" * 1000, "audio/mpeg")}, headers=EVIL)
    assert r.status_code == 403
    assert ran == []
    assert set(glob.glob(tempfile.gettempdir() + "/tabit_upload_*")) == before


def test_health_with_bad_host_is_403():
    r = TestClient(app, base_url="http://evil.com").get("/health")
    assert r.status_code == 403 and r.json() == {"detail": "forbidden"}


def test_preflight_with_bad_host_is_403():
    r = TestClient(app, base_url="http://evil.com").options(
        "/analyze", headers={"Origin": "http://localhost:5173",
                             "Access-Control-Request-Method": "POST"})
    assert r.status_code == 403


def test_preflight_with_good_host_still_gets_cors():
    r = TestClient(app, base_url=BASE).options(
        "/analyze", headers={"Origin": "http://localhost:5173",
                             "Access-Control-Request-Method": "POST"})
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_extension_origin_post_still_works(ran):
    r = TestClient(app, base_url=BASE).post(
        "/analyze", json={"url": "https://youtu.be/dQw4w9WgXcQ"}, headers=EXT)
    assert r.status_code == 202


def test_foreign_origin_get_with_good_host_passes():
    r = TestClient(app, base_url=BASE).get("/health", headers=EVIL)
    assert r.status_code == 200


def test_health_plain():
    r = TestClient(app, base_url=BASE).get("/health")
    assert r.status_code == 200 and r.json()["engineVersion"] == engine_version()


def test_websocket_with_bad_host_is_rejected():
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect):
        with TestClient(app, base_url="http://evil.com").websocket_connect("/ws"):
            pass


def test_guard_is_outermost_middleware():
    classes = [mw.cls for mw in app.user_middleware]
    assert classes[0] is LocalGuardMiddleware
    assert classes.index(LocalGuardMiddleware) < classes.index(
        next(c for c in classes if c.__name__ == "CORSMiddleware"))
