# Chord-Accuracy Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace tabIt's synthetic-only accuracy claim (0.495 majmin) with a real-song, published-annotation benchmark whose headline majmin number is comparable to the chord-recognition literature.

**Architecture:** A shared mir_eval scoring helper in `engine/eval.py` (used by both the existing synthetic test and the new benchmark), plus a standalone `benchmarks/` package that reads a YAML manifest of songs (YouTube URL + Isophonics `.lab`), runs each through the live `engine.analyze()` pipeline, scores with mir_eval, and writes a committed JSON + Markdown report. The benchmark is never collected by pytest (yt-dlp is blocked in CI); only its pure helpers are unit-tested.

**Tech Stack:** Python 3.11, mir_eval 0.8.2, PyYAML 6.0.3, pydantic, pytest. Reuses `engine.pipeline.analyze` and `engine.schema` (Chart/ChordSegment/Source).

## Global Constraints

- Python pinned 3.11; run inside `.venv` (`source .venv/bin/activate`).
- mir_eval pinned `==0.8.2`.
- The benchmark MUST NOT be collected by pytest and MUST NOT run in CI (yt-dlp is blocked from datacenter IPs). Only pure, network-free helpers get pytest coverage, under `tests/benchmarks/`.
- Audio is NEVER committed. Only `.lab` annotation text, the manifest, and results files are committed.
- Metrics reported: `majmin` (headline), `sevenths`, `root` — in that column order.
- Isophonics annotations require attribution + license note in `benchmarks/README.md`.
- Engine chord quality vocabulary → mir_eval quality mapping is fixed (see Task 1); unknown qualities fall back to `maj`.
- Duration-mismatch tolerance for the alignment warning is **±3%** (`tol=0.03`).

---

### Task 1: Shared mir_eval scoring helper (`engine/eval.py`) + refactor synthetic test

**Files:**
- Create: `engine/eval.py`
- Create: `tests/test_eval.py`
- Modify: `tests/integration/test_accuracy.py` (delegate scoring to the helper)

**Interfaces:**
- Consumes: `engine.schema.ChordSegment` (`.start`, `.end`, `.root`, `.quality`).
- Produces:
  - `MIR_QUALITY: dict[str, str]`
  - `to_mir_label(root: str, quality: str) -> str`
  - `load_lab(path) -> tuple[np.ndarray, list[str]]` — intervals shape `(N, 2)`, labels Harte strings.
  - `chords_to_mir(chords: list[ChordSegment], offset_sec: float = 0.0) -> tuple[np.ndarray, list[str]]`
  - `score_chart(ref_int, ref_lab, est_int, est_lab, metrics=("majmin","sevenths","root")) -> dict[str, float]`

- [ ] **Step 1: Write the failing test**

Create `tests/test_eval.py`:

```python
import numpy as np
import pytest

from engine.eval import to_mir_label, chords_to_mir, score_chart, load_lab
from engine.schema import ChordSegment


def _seg(start, end, root, quality):
    return ChordSegment(start=start, end=end, label="x",
                        root=root, quality=quality, bass=root, confidence=1.0)


def test_to_mir_label_maps_engine_qualities():
    assert to_mir_label("C", "maj") == "C:maj"
    assert to_mir_label("A", "min") == "A:min"
    assert to_mir_label("G", "dom7") == "G:7"
    assert to_mir_label("C", "6") == "C:maj6"
    assert to_mir_label("N", "N") == "N"
    # unknown quality falls back to maj
    assert to_mir_label("D", "weird") == "D:maj"


def test_chords_to_mir_applies_offset():
    chords = [_seg(0.0, 2.0, "C", "maj"), _seg(2.0, 4.0, "A", "min")]
    intervals, labels = chords_to_mir(chords, offset_sec=1.5)
    assert labels == ["C:maj", "A:min"]
    np.testing.assert_allclose(intervals, [[1.5, 3.5], [3.5, 5.5]])


def test_score_chart_perfect_match_is_one():
    ref_int = np.array([[0.0, 2.0], [2.0, 4.0]])
    ref_lab = ["C:maj", "A:min"]
    est_int = np.array([[0.0, 2.0], [2.0, 4.0]])
    est_lab = ["C:maj", "A:min"]
    scores = score_chart(ref_int, ref_lab, est_int, est_lab)
    assert scores["majmin"] == pytest.approx(1.0)
    assert scores["root"] == pytest.approx(1.0)
    assert scores["sevenths"] == pytest.approx(1.0)


def test_score_chart_half_wrong_is_half():
    ref_int = np.array([[0.0, 2.0], [2.0, 4.0]])
    ref_lab = ["C:maj", "A:min"]
    est_int = np.array([[0.0, 2.0], [2.0, 4.0]])
    est_lab = ["C:maj", "C:maj"]  # second chord wrong
    scores = score_chart(ref_int, ref_lab, est_int, est_lab)
    assert scores["majmin"] == pytest.approx(0.5)


def test_load_lab_round_trips(tmp_path):
    lab = tmp_path / "x.lab"
    lab.write_text("0.000 2.000 C:maj\n2.000 4.000 A:min\n")
    intervals, labels = load_lab(str(lab))
    assert labels == ["C:maj", "A:min"]
    np.testing.assert_allclose(intervals, [[0.0, 2.0], [2.0, 4.0]])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source .venv/bin/activate && pytest tests/test_eval.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'engine.eval'`

- [ ] **Step 3: Write minimal implementation**

Create `engine/eval.py`:

```python
"""Shared mir_eval chord-scoring helpers.

Used by the synthetic regression test (tests/integration/test_accuracy.py)
and the real-song benchmark (benchmarks/chord_accuracy.py) so there is one
scoring code path. Scores are mir_eval weighted accuracy in [0, 1].
"""
import numpy as np
import mir_eval

# engine chord quality -> mir_eval chord quality shorthand (see engine.schema
# QUALITY_SUFFIX for the engine vocabulary; mir_eval.chord.QUALITIES for targets)
MIR_QUALITY = {
    "maj": "maj", "min": "min", "dom7": "7", "maj7": "maj7", "min7": "min7",
    "dim": "dim", "aug": "aug", "sus2": "sus2", "sus4": "sus4", "6": "maj6",
    "min6": "min6", "hdim7": "hdim7", "dim7": "dim7", "minmaj7": "minmaj7",
    "9": "9", "maj9": "maj9", "min9": "min9",
}

_COMPARATORS = {
    "root": mir_eval.chord.root,
    "majmin": mir_eval.chord.majmin,
    "sevenths": mir_eval.chord.sevenths,
}


def to_mir_label(root: str, quality: str) -> str:
    """Format an engine (root, quality) as a mir_eval/Harte chord label.

    Inversion (bass) is intentionally omitted: the reported metrics
    (majmin, sevenths, root) all ignore inversion.
    """
    if root == "N" or quality == "N":
        return "N"
    return f"{root}:{MIR_QUALITY.get(quality, 'maj')}"


def load_lab(path):
    """Parse a Harte `.lab` file: whitespace-separated `start end label` lines."""
    intervals, labels = [], []
    with open(path) as f:
        for line in f:
            if not line.strip():
                continue
            start, end, label = line.split(maxsplit=2)
            intervals.append([float(start), float(end)])
            labels.append(label.strip())
    return np.array(intervals, dtype=float), labels


def chords_to_mir(chords, offset_sec: float = 0.0):
    """Convert engine ChordSegments to (intervals, mir_eval labels).

    offset_sec shifts every interval later, compensating for a constant
    intro-padding difference between the annotated master and the fetched audio.
    """
    intervals = np.array(
        [[c.start + offset_sec, c.end + offset_sec] for c in chords], dtype=float)
    labels = [to_mir_label(c.root, c.quality) for c in chords]
    return intervals, labels


def score_chart(ref_int, ref_lab, est_int, est_lab,
                metrics=("majmin", "sevenths", "root")) -> dict:
    """Weighted-accuracy score of estimated chords vs reference, per metric."""
    est_int, est_lab = mir_eval.util.adjust_intervals(
        est_int, est_lab, ref_int[0][0], ref_int[-1][1],
        mir_eval.chord.NO_CHORD, mir_eval.chord.NO_CHORD)
    ints, ref_l, est_l = mir_eval.util.merge_labeled_intervals(
        ref_int, ref_lab, est_int, est_lab)
    durations = mir_eval.util.intervals_to_durations(ints)
    scores = {}
    for m in metrics:
        comparisons = _COMPARATORS[m](ref_l, est_l)
        scores[m] = float(mir_eval.chord.weighted_accuracy(comparisons, durations))
    return scores
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source .venv/bin/activate && pytest tests/test_eval.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Refactor the synthetic test to delegate**

Modify `tests/integration/test_accuracy.py`. Replace the inline `_load_lab` and the mir_eval wiring in `test_majmin_accuracy_on_synthetic_clip` with calls to the shared helper. The final file body:

```python
"""Accuracy harness: score the engine's chord output against ground truth via mir_eval.

Deviates from the brief's licensed-real-clip fixture: instead of a
hand-labeled real pop song, we synthesize a deterministic, richly-timbred
Am -> F -> C -> G progression programmatically (tests/integration/conftest.py,
`ref_clip` fixture) so the harness is self-contained and reproducible without
a copyrighted asset. Real-song accuracy lives in benchmarks/ (network, local-only).
"""
import pytest

from engine.pipeline import analyze
from engine.eval import load_lab, chords_to_mir, score_chart


@pytest.mark.integration
def test_majmin_accuracy_on_synthetic_clip(ref_clip):
    ref_int, ref_lab = load_lab(ref_clip["lab"])
    chart = analyze(ref_clip["wav"], created_at="2026-07-09T00:00:00Z")

    est_int, est_lab = chords_to_mir(chart.chords)
    score = score_chart(ref_int, ref_lab, est_int, est_lab, metrics=("majmin",))["majmin"]

    print(f"\nmajmin weighted accuracy (synthetic Am-F-C-G clip): {score:.3f}")

    # Harness-validation assertions: analyze() runs end-to-end, produces chords,
    # and the mir_eval scoring pipeline returns a valid score in [0, 1].
    assert len(chart.chords) >= 1
    assert 0.0 <= score <= 1.0

    # Honest floor: crema is trained on real recordings, not synthesized tones,
    # so a synthetic clip is out of distribution. This is a synthetic-fixture
    # regression floor, not a real-music benchmark (that lives in benchmarks/).
    assert score >= 0.4
```

- [ ] **Step 6: Run the synthetic test to verify no regression**

Run: `source .venv/bin/activate && pytest tests/integration/test_accuracy.py -v -s`
Expected: PASS — the printed majmin score is ~0.495 (unchanged from before the refactor).

- [ ] **Step 7: Commit**

```bash
git add engine/eval.py tests/test_eval.py tests/integration/test_accuracy.py
git commit -m "feat(eval): shared mir_eval chord scorer; synthetic test delegates to it"
```

---

### Task 2: Benchmark pure helpers (manifest, duration gate, aggregation, rendering)

**Files:**
- Create: `benchmarks/__init__.py` (empty)
- Create: `benchmarks/chord_accuracy.py` (pure helpers only in this task)
- Create: `tests/benchmarks/__init__.py` (empty)
- Create: `tests/benchmarks/test_helpers.py`

**Interfaces:**
- Consumes: `engine.eval` (Task 1).
- Produces:
  - `Song` (pydantic model): `id, title, url, lab, ref_duration: float | None, offset_sec: float = 0.0`
  - `load_manifest(path) -> list[Song]` — resolves each `song.lab` relative to the manifest file's parent directory (mutates `lab` to an absolute path).
  - `duration_warning(actual: float, expected: float | None, tol: float = 0.03) -> str | None`
  - `aggregate(rows: list[dict], metrics) -> dict` — returns `{"all": {metric: float}, "aligned": {metric: float}}`, duration-weighted.
  - `render_markdown(rows: list[dict], agg: dict, metrics) -> str`
  - Row dict shape (produced by Task 3, consumed by `aggregate`/`render_markdown`): `{"id": str, "title": str, "scores": dict|None, "weight": float, "warning": str|None, "error": str|None}`

- [ ] **Step 1: Write the failing test**

Create `tests/benchmarks/test_helpers.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source .venv/bin/activate && pytest tests/benchmarks/test_helpers.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'benchmarks'`

- [ ] **Step 3: Write minimal implementation**

Create `benchmarks/__init__.py` (empty) and `tests/benchmarks/__init__.py` (empty).

Create `benchmarks/chord_accuracy.py` with the pure helpers (orchestration + CLI added in Task 3):

```python
"""Real-song chord-accuracy benchmark for the tabIt engine.

Runs a manifest of songs through the live engine.analyze() pipeline
(YouTube-URL ingest) and scores chords against published Isophonics
annotations with mir_eval. Local/manual only: yt-dlp is blocked from
datacenter IPs, so this never runs in CI. Not collected by pytest.
"""
from pathlib import Path

import yaml
from pydantic import BaseModel


class Song(BaseModel):
    id: str
    title: str
    url: str
    lab: str
    ref_duration: float | None = None
    offset_sec: float = 0.0


def load_manifest(path) -> list[Song]:
    """Parse the YAML manifest; resolve each `lab` relative to the manifest dir."""
    manifest_path = Path(path)
    data = yaml.safe_load(manifest_path.read_text()) or []
    songs = []
    for entry in data:
        song = Song(**entry)
        song.lab = str((manifest_path.parent / song.lab).resolve())
        songs.append(song)
    return songs


def duration_warning(actual: float, expected: float | None, tol: float = 0.03):
    """Return a short warning string if fetched duration drifts from the
    annotated master beyond `tol`, else None."""
    if not expected:
        return None
    delta = (actual - expected) / expected
    if abs(delta) > tol:
        return f"dur {delta * 100:+.0f}%"
    return None


def aggregate(rows: list[dict], metrics) -> dict:
    """Duration-weighted mean per metric, over all scored rows and over
    aligned-only rows (excluding duration-warned rows)."""
    def _agg(subset):
        out = {}
        for m in metrics:
            den = sum(r["weight"] for r in subset)
            num = sum(r["scores"][m] * r["weight"] for r in subset)
            out[m] = (num / den) if den else 0.0
        return out

    scored = [r for r in rows if r.get("scores") is not None]
    aligned = [r for r in scored if not r.get("warning")]
    return {"all": _agg(scored), "aligned": _agg(aligned)}


def render_markdown(rows: list[dict], agg: dict, metrics) -> str:
    """Render the human-readable results table."""
    header = "| Song | " + " | ".join(metrics) + " | notes |"
    sep = "|------|" + "".join("-------:|" for _ in metrics) + "-------|"
    lines = [header, sep]
    for r in rows:
        if r.get("scores") is None:
            cells = " | ".join("—" for _ in metrics)
            note = r.get("error") or ""
        else:
            cells = " | ".join(f"{r['scores'][m]:.2f}" for m in metrics)
            note = r.get("warning") or ""
            if note:
                note = f"⚠ {note}"
        lines.append(f"| {r['title']} | {cells} | {note} |")
    all_cells = " | ".join(f"**{agg['all'][m]:.2f}**" for m in metrics)
    aligned_cells = " | ".join(f"**{agg['aligned'][m]:.2f}**" for m in metrics)
    lines.append(f"| **Aggregate (all)** | {all_cells} | duration-weighted |")
    lines.append(f"| **Aggregate (aligned)** | {aligned_cells} | excludes ⚠ |")
    return "\n".join(lines) + "\n"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source .venv/bin/activate && pytest tests/benchmarks/test_helpers.py -v`
Expected: PASS (7 passed)

- [ ] **Step 5: Ensure pytest never collects the benchmark package**

Verify `benchmarks/` is not collected: the test dir is `tests/benchmarks/` (collected) but `benchmarks/` holds no `test_*.py`, so it is inert. Confirm the whole suite still green:

Run: `source .venv/bin/activate && pytest -q 2>&1 | tail -5`
Expected: all tests pass; no files from `benchmarks/` collected.

- [ ] **Step 6: Commit**

```bash
git add benchmarks/__init__.py benchmarks/chord_accuracy.py tests/benchmarks/
git commit -m "feat(benchmarks): pure helpers for manifest, duration gate, aggregation, rendering"
```

---

### Task 3: Benchmark orchestration + CLI

**Files:**
- Modify: `benchmarks/chord_accuracy.py` (add orchestration + `main()`)
- Modify: `tests/benchmarks/test_helpers.py` → add orchestration tests (or a new `tests/benchmarks/test_run.py`)

**Interfaces:**
- Consumes: `load_manifest`, `duration_warning`, `aggregate`, `render_markdown` (Task 2); `engine.eval.load_lab`, `engine.eval.chords_to_mir`, `engine.eval.score_chart` (Task 1); `engine.pipeline.analyze`.
- Produces:
  - `run_benchmark(songs: list[Song], base_dir: Path, metrics=(...), analyze_fn=analyze, created_at: str = ...) -> dict` — returns the results dict `{"engineVersion": str|None, "metrics": list, "songs": [row, ...], "aggregate": {...}}`. `analyze_fn` is injectable for testing (defaults to the real pipeline). Each row also carries `"duration": float|None`.
  - `write_results(results: dict, base_dir: Path) -> None` — writes `results/latest.json` and `results/latest.md`.
  - `main(argv=None) -> None` — CLI: `python -m benchmarks.chord_accuracy [--manifest PATH]`.

- [ ] **Step 1: Write the failing test**

Create `tests/benchmarks/test_run.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source .venv/bin/activate && pytest tests/benchmarks/test_run.py -v`
Expected: FAIL — `ImportError: cannot import name 'run_benchmark'`

- [ ] **Step 3: Write minimal implementation**

Append to `benchmarks/chord_accuracy.py`:

```python
import argparse
import json
from datetime import datetime, timezone

from engine.pipeline import analyze
from engine.eval import load_lab, chords_to_mir, score_chart

DEFAULT_METRICS = ("majmin", "sevenths", "root")


def run_benchmark(songs, base_dir, metrics=DEFAULT_METRICS,
                  analyze_fn=analyze, created_at=None) -> dict:
    """Analyze + score every song. Never raises for a single-song failure:
    a failed song gets scores=None and an error note."""
    created_at = created_at or datetime.now(timezone.utc).isoformat()
    rows, engine_version = [], None
    for song in songs:
        row = {"id": song.id, "title": song.title, "scores": None,
               "weight": 0.0, "warning": None, "error": None, "duration": None}
        try:
            chart = analyze_fn(song.url, created_at=created_at)
            engine_version = chart.analysis.engineVersion
            row["duration"] = chart.source.duration
            row["warning"] = duration_warning(chart.source.duration, song.ref_duration)

            ref_int, ref_lab = load_lab(song.lab)
            est_int, est_lab = chords_to_mir(chart.chords, offset_sec=song.offset_sec)
            row["scores"] = score_chart(ref_int, ref_lab, est_int, est_lab, metrics=metrics)
            row["weight"] = float(ref_int[-1][1] - ref_int[0][0])  # scored span (s)
        except Exception as exc:  # dead URL, empty chart, yt-dlp error, ...
            row["error"] = f"{type(exc).__name__}: {exc}"
        rows.append(row)
        print(f"  {song.id}: "
              + ("ERROR " + row["error"] if row["error"]
                 else " ".join(f"{m}={row['scores'][m]:.2f}" for m in metrics)
                      + (f"  [{row['warning']}]" if row["warning"] else "")))

    return {
        "engineVersion": engine_version,
        "metrics": list(metrics),
        "songs": rows,
        "aggregate": aggregate(rows, metrics),
    }


def write_results(results: dict, base_dir) -> None:
    out_dir = Path(base_dir) / "results"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "latest.json").write_text(json.dumps(results, indent=2) + "\n")
    md = render_markdown(results["songs"], results["aggregate"], tuple(results["metrics"]))
    (out_dir / "latest.md").write_text(md)


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description="tabIt real-song chord-accuracy benchmark")
    parser.add_argument("--manifest", default=str(Path(__file__).parent / "manifest.yaml"),
                        help="path to the song manifest YAML")
    args = parser.parse_args(argv)

    manifest_path = Path(args.manifest)
    songs = load_manifest(str(manifest_path))
    print(f"Running benchmark on {len(songs)} songs...")
    results = run_benchmark(songs, manifest_path.parent)
    write_results(results, manifest_path.parent)
    agg = results["aggregate"]
    print(f"\nHeadline majmin: all={agg['all']['majmin']:.3f} "
          f"aligned={agg['aligned']['majmin']:.3f}")
    print(f"Wrote {manifest_path.parent / 'results' / 'latest.md'}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source .venv/bin/activate && pytest tests/benchmarks/test_run.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Verify CLI wiring with an empty manifest**

Run:
```bash
source .venv/bin/activate && mkdir -p /tmp/bench && printf '[]\n' > /tmp/bench/manifest.yaml && python -m benchmarks.chord_accuracy --manifest /tmp/bench/manifest.yaml
```
Expected: prints `Running benchmark on 0 songs...`, `Headline majmin: all=0.000 aligned=0.000`, and writes `/tmp/bench/results/latest.md`. No traceback.

- [ ] **Step 6: Run the full suite**

Run: `source .venv/bin/activate && pytest -q 2>&1 | tail -5`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add benchmarks/chord_accuracy.py tests/benchmarks/test_run.py
git commit -m "feat(benchmarks): orchestration + CLI for the chord-accuracy benchmark"
```

---

### Task 4: Curate songs, fetch annotations, run, and publish results

**Files:**
- Create: `benchmarks/manifest.yaml`
- Create: `benchmarks/annotations/beatles/*.lab` (downloaded Isophonics labs)
- Create: `benchmarks/README.md`
- Create: `benchmarks/results/latest.json`, `benchmarks/results/latest.md` (generated)
- Modify: `.gitignore` (ignore any local audio scratch dir)
- Modify: repo `README.md` (accuracy section)

This task is operational (data gathering + a real network run), so it has no TDD cycle. Each step is concrete.

- [ ] **Step 1: Fetch Isophonics annotations**

Download the Beatles chord-lab annotations from Isophonics (http://isophonics.net/content/reference-annotations-beatles — "Chordlab"). Pick **8–12 tracks** spanning simple and harmonically richer songs. Copy the chosen `.lab` files into `benchmarks/annotations/beatles/`, renamed to clean slugs (e.g. `let_it_be.lab`). Do NOT download or store audio.

Verify each lab parses:
```bash
source .venv/bin/activate && python -c "
from engine.eval import load_lab
import glob
for p in glob.glob('benchmarks/annotations/beatles/*.lab'):
    i, l = load_lab(p); print(p, len(l), 'labels', i[-1][1], 's')
"
```
Expected: each file prints a label count and a plausible end time (matching the studio track length).

- [ ] **Step 2: Write `benchmarks/README.md`**

Include: what the benchmark measures, how to run it (`python -m benchmarks.chord_accuracy`), the local-only/CI caveat, the alignment strategy (`ref_duration` gate + manual `offset_sec`), and the Isophonics attribution + license:

```markdown
# tabIt chord-accuracy benchmark

Scores the engine's chords against published Isophonics annotations with mir_eval
(majmin / sevenths / root weighted accuracy). Runs each song through the live
`engine.analyze()` YouTube pipeline.

## Run
    source .venv/bin/activate
    python -m benchmarks.chord_accuracy        # uses benchmarks/manifest.yaml

Local-only: yt-dlp is blocked from datacenter IPs, so this never runs in CI.
First run is ~40s/song; the engine caches charts, so re-runs are near-instant.

## Alignment
Annotations are timed to specific studio masters. `ref_duration` flags a fetched
YouTube upload whose length drifts >3% from the master; `offset_sec` (calibrated
by hand, once per song) corrects a constant intro-padding shift. Per-song scores
are always shown so a misaligned upload is visible, not hidden in the aggregate.

## Annotations
Isophonics Beatles chord annotations, © Centre for Digital Music, Queen Mary
University of London, released for research use (attribution: C. Harte, "Towards
Automatic Extraction of Harmony Information from Music Signals", PhD thesis, QMUL,
2010; http://isophonics.net). Only annotation text is committed here; no audio.
```

- [ ] **Step 3: Build the manifest**

Create `benchmarks/manifest.yaml`. For each chosen song, find a YouTube upload matching the annotated studio master (prefer official/"- Topic" uploads; avoid remasters/live/edits). Set `ref_duration` to the annotation's end time from Step 1. Start `offset_sec: 0.0`.

```yaml
- id: beatles-let-it-be
  title: "The Beatles — Let It Be"
  url: "https://www.youtube.com/watch?v=REPLACE"
  lab: annotations/beatles/let_it_be.lab
  ref_duration: 243.0
  offset_sec: 0.0
# ... 7–11 more entries
```

- [ ] **Step 4: First benchmark run**

Run:
```bash
source .venv/bin/activate && python -m benchmarks.chord_accuracy
```
Expected: per-song lines print with scores (or `[dur ±N%]` flags), then a headline majmin. Note which songs carry duration warnings.

- [ ] **Step 5: Calibrate offsets for flagged/low songs**

For any song with a duration warning or a suspiciously low majmin, listen to the YouTube upload's first chord change vs the `.lab`'s first non-`N` interval start; set `offset_sec` to the difference (positive if the upload starts later). Re-run (cached analysis makes this fast) until scores stabilize. If an upload is a genuinely different recording (can't be fixed by a constant offset), swap the URL for a better match. Leave the duration warning in place if it persists — it is meant to show.

- [ ] **Step 6: Commit the data + generated results**

```bash
git add benchmarks/manifest.yaml benchmarks/annotations benchmarks/README.md benchmarks/results
git commit -m "feat(benchmarks): Isophonics pilot manifest, annotations, and first results"
```

- [ ] **Step 7: Update the repo README accuracy section**

Replace the synthetic-only 0.495 mention with the real headline (duration-weighted majmin, aligned), the sample caveat (N Isophonics songs, YouTube-sourced), and a link to `benchmarks/results/latest.md`. Keep the honest framing (pilot sample, not the full dataset).

```bash
git add README.md
git commit -m "docs: cite the real-song chord-accuracy benchmark instead of the synthetic floor"
```

- [ ] **Step 8: Confirm the ignore rule**

Ensure no audio was staged and that any local scratch audio dir is git-ignored:
```bash
git status --porcelain | grep -Ei '\.(wav|mp3|m4a|flac|webm)$' && echo "AUDIO STAGED — STOP" || echo "no audio staged (good)"
```
Expected: `no audio staged (good)`. If a scratch dir exists, add it to `.gitignore`.

---

## Self-Review Notes

- **Spec coverage:** shared scorer (Task 1) ✔; standalone script not in CI (Tasks 2–3, pytest only covers pure helpers) ✔; manifest schema incl. `ref_duration`/`offset_sec` (Task 2) ✔; duration gate ±3% (Task 2) ✔; manual offset, no auto-search (Task 4 Step 5) ✔; majmin/sevenths/root (Tasks 1–3) ✔; duration-weighted all-vs-aligned aggregate (Task 2) ✔; error resilience (Task 3) ✔; JSON + MD outputs (Task 3) ✔; annotations committed + attribution, no audio (Task 4) ✔; README update (Task 4) ✔.
- **Type consistency:** `score_chart`, `chords_to_mir`, `load_lab` signatures match across Tasks 1/3; row dict shape defined in Task 2 and produced in Task 3 identically (`id,title,scores,weight,warning,error,duration`).
- **Placeholder scan:** manifest `url: REPLACE` and `ref_duration: 243.0` are intentional templates filled by the operator in Task 4, not code placeholders.
