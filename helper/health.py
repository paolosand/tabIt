"""Health probing for the local helper, stdlib-only."""
import json
import time
import urllib.error
import urllib.request

from helper import paths


def check_health(timeout: float = 2.0) -> dict | None:
    """GET /health; None when nothing (reachable) answers with JSON."""
    try:
        with urllib.request.urlopen(paths.HEALTH_URL, timeout=timeout) as res:
            return json.load(res)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None


def wait_for_health(timeout_s: float = 60.0) -> dict | None:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        found = check_health()
        if found is not None and "engineVersion" in found:
            return found
        time.sleep(1.0)
    return None
