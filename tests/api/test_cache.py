from api.cache import ChartCache


def _chart(video_id="abc123XYZ_-", version="0.1.0"):
    return {
        "schemaVersion": 1,
        "source": {"kind": "youtube", "videoId": video_id, "duration": 1.0},
        "analysis": {"engineVersion": version, "createdAt": "2026-07-09T00:00:00Z"},
    }


def test_put_then_get_roundtrips(tmp_path):
    cache = ChartCache(str(tmp_path))
    cache.put(_chart())
    assert cache.get("abc123XYZ_-", "0.1.0")["schemaVersion"] == 1


def test_get_misses_on_other_version(tmp_path):
    cache = ChartCache(str(tmp_path))
    cache.put(_chart(version="0.1.0"))
    assert cache.get("abc123XYZ_-", "0.2.0") is None


def test_put_skips_chart_without_video_id(tmp_path):
    cache = ChartCache(str(tmp_path))
    cache.put({"source": {"kind": "file", "videoId": None, "duration": 1.0},
               "analysis": {"engineVersion": "0.1.0", "createdAt": "x"}})
    assert list(tmp_path.iterdir()) == []
