import json
import os
import re

_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_VERSION_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def _valid(video_id: str | None, engine_version: str | None) -> bool:
    return bool(video_id and engine_version
                and _VIDEO_ID_RE.fullmatch(video_id)
                and _VERSION_RE.fullmatch(engine_version))


class ChartCache:
    """Disk cache of chart JSON, keyed by videoId + engineVersion."""

    def __init__(self, root: str):
        self.root = root
        os.makedirs(root, exist_ok=True)

    def _path(self, video_id: str, engine_version: str) -> str:
        return os.path.join(self.root, f"{video_id}@{engine_version}.json")

    def get(self, video_id: str, engine_version: str) -> dict | None:
        if not _valid(video_id, engine_version):
            return None
        path = self._path(video_id, engine_version)
        if not os.path.exists(path):
            return None
        with open(path) as f:
            return json.load(f)

    def put(self, chart: dict) -> None:
        video_id = chart.get("source", {}).get("videoId")
        version = chart.get("analysis", {}).get("engineVersion")
        if not _valid(video_id, version):
            return
        with open(self._path(video_id, version), "w") as f:
            json.dump(chart, f)
