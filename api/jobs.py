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
