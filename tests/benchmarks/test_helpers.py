import pytest

from benchmarks.chord_accuracy import (
    Song, load_manifest, duration_warning, aggregate, render_markdown,
)

METRICS = ("majmin", "sevenths", "root")


def test_load_manifest_resolves_lab_paths(tmp_path):
    (tmp_path / "annotations").mkdir()
    lab = tmp_path / "annotations" / "song.lab"
    lab.write_text("0 1 C:maj\n")
    manifest = tmp_path / "manifest.yaml"
    manifest.write_text(
        "- id: s1\n"
        "  title: Song One\n"
        "  url: https://youtu.be/abc\n"
        "  lab: annotations/song.lab\n"
        "  ref_duration: 100.0\n"
        "  offset_sec: 0.5\n"
    )
    songs = load_manifest(str(manifest))
    assert len(songs) == 1
    assert songs[0].id == "s1"
    assert songs[0].offset_sec == 0.5
    assert songs[0].lab == str(lab)  # resolved to absolute


def test_song_offset_defaults_to_zero():
    s = Song(id="x", title="X", url="u", lab="l.lab")
    assert s.offset_sec == 0.0
    assert s.ref_duration is None


def test_duration_warning_within_tolerance_is_none():
    assert duration_warning(100.0, 100.0) is None
    assert duration_warning(102.0, 100.0) is None  # +2% under 3%


def test_duration_warning_beyond_tolerance():
    assert duration_warning(94.0, 100.0) == "dur -6%"
    assert duration_warning(100.0, None) is None  # no expected -> no gate


def test_aggregate_is_duration_weighted_and_splits_aligned():
    rows = [
        {"scores": {"majmin": 1.0, "sevenths": 1.0, "root": 1.0}, "weight": 100.0, "warning": None},
        {"scores": {"majmin": 0.0, "sevenths": 0.0, "root": 0.0}, "weight": 100.0, "warning": "dur -6%"},
    ]
    agg = aggregate(rows, METRICS)
    # all: (1.0*100 + 0.0*100) / 200 = 0.5
    assert agg["all"]["majmin"] == pytest.approx(0.5)
    # aligned: excludes the warned row -> 1.0
    assert agg["aligned"]["majmin"] == pytest.approx(1.0)


def test_aggregate_ignores_errored_rows():
    rows = [
        {"scores": {"majmin": 0.8, "sevenths": 0.5, "root": 0.9}, "weight": 50.0, "warning": None},
        {"scores": None, "weight": 0.0, "warning": None},  # errored
    ]
    agg = aggregate(rows, METRICS)
    assert agg["all"]["majmin"] == pytest.approx(0.8)


def test_render_markdown_contains_rows_and_aggregates():
    rows = [
        {"id": "s1", "title": "Song One", "scores": {"majmin": 0.74, "sevenths": 0.61, "root": 0.83},
         "weight": 200.0, "warning": None, "error": None},
        {"id": "s2", "title": "Song Two", "scores": None, "weight": 0.0, "warning": None,
         "error": "yt-dlp failed"},
    ]
    agg = {"all": {"majmin": 0.74, "sevenths": 0.61, "root": 0.83},
           "aligned": {"majmin": 0.74, "sevenths": 0.61, "root": 0.83}}
    md = render_markdown(rows, agg, METRICS)
    assert "Song One" in md
    assert "0.74" in md
    assert "yt-dlp failed" in md
    assert "Aggregate (all)" in md
    assert "Aggregate (aligned)" in md
