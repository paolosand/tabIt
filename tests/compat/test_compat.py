"""Backwards-compatibility guard: the current helper API must stay a superset of every
recorded released version (additive-only), and the supported window must have fixtures."""
import json
from pathlib import Path

import pytest

from engine import __version__
from tests.compat.record import build_responses

FIXTURES = Path(__file__).parent / "fixtures"
VERSIONS = sorted(p.name for p in FIXTURES.iterdir() if p.is_dir()) if FIXTURES.exists() else []


def key_paths(obj, prefix="") -> set[str]:
    """Every dict key path in a JSON value; lists contribute their first element's paths."""
    paths: set[str] = set()
    if isinstance(obj, dict):
        for key, value in obj.items():
            path = f"{prefix}.{key}" if prefix else key
            paths.add(path)
            paths |= key_paths(value, path)
    elif isinstance(obj, list) and obj:
        paths |= key_paths(obj[0], prefix)
    return paths


def test_key_paths_detects_a_removed_field():
    assert key_paths({"a": {"b": 1}}) - key_paths({"a": {}}) == {"a.b"}


def test_floor_fixture_exists():
    # 0.5.0 never reached users and its release has no wheel; 0.5.1 is the earliest real fixture.
    assert (FIXTURES / "0.5.1").is_dir()


def test_current_version_has_fixtures():
    assert (FIXTURES / __version__).is_dir(), (
        f"record fixtures for {__version__}: python -m tests.compat.record {__version__}"
    )


@pytest.mark.parametrize("version", VERSIONS)
def test_current_api_is_superset_of_every_fixture(version):
    current = build_responses()
    for path in sorted((FIXTURES / version).glob("*.json")):
        old = json.loads(path.read_text())
        missing = key_paths(old) - key_paths(current[path.stem])
        assert not missing, f"{version}/{path.name}: current API dropped {sorted(missing)}"


def test_recorded_chart_comes_from_the_engine_schema(monkeypatch):
    """Guards the guard: the chart is built by engine.schema.Chart, not a hard-coded dict,
    so an engine that stops emitting a field shows up as a dropped key in the comparison."""
    from pydantic import BaseModel

    from engine.schema import Analysis, ChordSegment, Key, Scale, Source, Tempo
    from tests.compat import record

    class SlimChart(BaseModel):  # no sections / meter / downbeats
        schemaVersion: int = 1
        source: Source
        analysis: Analysis
        key: Key
        scales: list[Scale]
        tempo: Tempo
        beats: list[float]
        chords: list[ChordSegment]

    monkeypatch.setattr(record, "Chart", SlimChart)
    chart = record.build_responses()["chart"]
    assert "downbeats" not in chart and "meter" not in chart
    assert {"key", "tempo", "chords"} <= set(chart)
