import json
import os


class ChartCache:
    """Disk cache of chart JSON, keyed by videoId + engineVersion."""

    def __init__(self, root: str):
        self.root = root
        os.makedirs(root, exist_ok=True)

    def _path(self, video_id: str, engine_version: str) -> str:
        return os.path.join(self.root, f"{video_id}@{engine_version}.json")

    def get(self, video_id: str, engine_version: str) -> dict | None:
        path = self._path(video_id, engine_version)
        if not os.path.exists(path):
            return None
        with open(path) as f:
            return json.load(f)

    def put(self, chart: dict) -> None:
        video_id = chart.get("source", {}).get("videoId")
        version = chart.get("analysis", {}).get("engineVersion")
        if not video_id or not version:
            return
        with open(self._path(video_id, version), "w") as f:
            json.dump(chart, f)
