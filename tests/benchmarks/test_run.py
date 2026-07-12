import json

import pytest

from benchmarks.chord_accuracy import Song, run_benchmark, write_results
from engine.schema import Chart, ChordSegment, Source, Analysis, Key, Tempo

METRICS = ("majmin", "sevenths", "root")


def _fake_chart(duration, chords):
    return Chart(
        source=Source(kind="youtube", videoId="abc", title="t", duration=duration),
        analysis=Analysis(engineVersion="9.9.9", createdAt="2026-07-12T00:00:00Z"),
        key=Key(tonic="C", mode="major", confidence=1.0),
        scales=[], tempo=Tempo(bpm=120.0), beats=[], chords=chords,
    )


def _write_lab(tmp_path, name, text):
    p = tmp_path / name
    p.write_text(text)
    return str(p)


def test_run_benchmark_scores_and_flags(tmp_path):
    lab = _write_lab(tmp_path, "s1.lab", "0.000 2.000 C:maj\n2.000 4.000 A:min\n")
    song = Song(id="s1", title="Song One", url="u", lab=lab, ref_duration=4.0)

    def fake_analyze(url, *, created_at):
        return _fake_chart(4.0, [
            ChordSegment(start=0.0, end=2.0, label="C", root="C", quality="maj", bass="C", confidence=1.0),
            ChordSegment(start=2.0, end=4.0, label="Am", root="A", quality="min", bass="A", confidence=1.0),
        ])

    results = run_benchmark([song], tmp_path, metrics=METRICS, analyze_fn=fake_analyze)
    row = results["songs"][0]
    assert row["scores"]["majmin"] == pytest.approx(1.0)
    assert row["warning"] is None
    assert results["aggregate"]["all"]["majmin"] == pytest.approx(1.0)
    assert results["engineVersion"] == "9.9.9"


def test_run_benchmark_sets_duration_warning(tmp_path):
    lab = _write_lab(tmp_path, "s1.lab", "0.000 2.000 C:maj\n")
    song = Song(id="s1", title="Song One", url="u", lab=lab, ref_duration=10.0)

    def fake_analyze(url, *, created_at):  # fetched audio is 2s vs 10s annotated
        return _fake_chart(2.0, [
            ChordSegment(start=0.0, end=2.0, label="C", root="C", quality="maj", bass="C", confidence=1.0),
        ])

    results = run_benchmark([song], tmp_path, metrics=METRICS, analyze_fn=fake_analyze)
    assert results["songs"][0]["warning"] == "dur -80%"


def test_run_benchmark_survives_analyze_error(tmp_path):
    lab = _write_lab(tmp_path, "s1.lab", "0.000 2.000 C:maj\n")
    song = Song(id="s1", title="Song One", url="u", lab=lab, ref_duration=2.0)

    def boom(url, *, created_at):
        raise RuntimeError("yt-dlp failed")

    results = run_benchmark([song], tmp_path, metrics=METRICS, analyze_fn=boom)
    row = results["songs"][0]
    assert row["scores"] is None
    assert "yt-dlp failed" in row["error"]


def test_run_benchmark_empty_chart_is_error(tmp_path):
    lab = _write_lab(tmp_path, "s1.lab", "0.000 2.000 C:maj\n")
    song = Song(id="s1", title="Song One", url="u", lab=lab, ref_duration=2.0)

    def fake_analyze(url, *, created_at):
        return _fake_chart(2.0, [])

    results = run_benchmark([song], tmp_path, metrics=METRICS, analyze_fn=fake_analyze)
    row = results["songs"][0]
    assert row["scores"] is None
    assert "empty chart" in row["error"]


def test_write_results_emits_json_and_md(tmp_path):
    lab = _write_lab(tmp_path, "s1.lab", "0.000 2.000 C:maj\n")
    song = Song(id="s1", title="Song One", url="u", lab=lab, ref_duration=2.0)

    def fake_analyze(url, *, created_at):
        return _fake_chart(2.0, [
            ChordSegment(start=0.0, end=2.0, label="C", root="C", quality="maj", bass="C", confidence=1.0),
        ])

    results = run_benchmark([song], tmp_path, metrics=METRICS, analyze_fn=fake_analyze)
    write_results(results, tmp_path)
    assert (tmp_path / "results" / "latest.json").exists()
    assert (tmp_path / "results" / "latest.md").exists()
    loaded = json.loads((tmp_path / "results" / "latest.json").read_text())
    assert loaded["songs"][0]["scores"]["majmin"] == pytest.approx(1.0)
    assert "Song One" in (tmp_path / "results" / "latest.md").read_text()
