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
