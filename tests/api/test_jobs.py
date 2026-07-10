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
