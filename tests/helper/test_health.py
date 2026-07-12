import io
import urllib.error

from helper import health


def test_check_health_parses_ok(monkeypatch):
    class FakeResponse(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(
        health.urllib.request, "urlopen",
        lambda url, timeout: FakeResponse(b'{"status": "ok", "engineVersion": "0.2.1"}'),
    )
    assert health.check_health() == {"status": "ok", "engineVersion": "0.2.1"}


def test_check_health_none_when_unreachable(monkeypatch):
    def boom(url, timeout):
        raise urllib.error.URLError("refused")
    monkeypatch.setattr(health.urllib.request, "urlopen", boom)
    assert health.check_health() is None


def test_check_health_empty_dict_on_http_error(monkeypatch):
    def boom(url, timeout):
        raise urllib.error.HTTPError(url, 404, "Not Found", hdrs=None, fp=None)
    monkeypatch.setattr(health.urllib.request, "urlopen", boom)
    assert health.check_health() == {}


def test_check_health_empty_dict_on_non_json_body(monkeypatch):
    class FakeResponse(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(
        health.urllib.request, "urlopen",
        lambda url, timeout: FakeResponse(b"<html>hi</html>"),
    )
    assert health.check_health() == {}
