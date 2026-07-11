import threading
import time

from api.jobs import JobStore


def test_job_lifecycle_success():
    store = JobStore()
    release = threading.Event()

    def work(job_id):
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
    job_id = store.submit(lambda _job_id: (_ for _ in ()).throw(RuntimeError("boom")))
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


def test_set_step_surfaces_on_pending_job_and_clears_when_done():
    store = JobStore()
    release = threading.Event()
    stepped = threading.Event()

    def work(job_id):
        store.set_step(job_id, "separate")
        stepped.set()
        release.wait(timeout=5)
        return {"ok": True}

    job_id = store.submit(work)
    assert stepped.wait(5)
    assert store.get(job_id) == {"status": "pending", "step": "separate"}

    release.set()
    deadline = time.time() + 5
    while store.get(job_id)["status"] == "pending" and time.time() < deadline:
        time.sleep(0.01)
    result = store.get(job_id)
    assert result["status"] == "done"
    assert "step" not in result


def test_set_step_on_resolved_or_unknown_job_is_noop():
    store = JobStore()
    job_id = store.submit_done({"cached": True})
    store.set_step(job_id, "separate")
    assert store.get(job_id) == {"status": "done", "chart": {"cached": True}}
    store.set_step("nope", "separate")  # must not raise or create a job
    assert store.get("nope") is None
