# tabIt Chord-Accuracy Benchmark — Design

Date: 2026-07-12
Status: Approved (brainstorming)

## Problem

tabIt's only quantitative accuracy figure is `0.495` majmin weighted accuracy on a
**synthetic** Am–F–C–G clip (`tests/integration/test_accuracy.py`). That number is a
harness-validation floor, not a real-music result — crema is trained on real
recordings, so a synthesized clip is out of distribution. The README therefore
*asserts* quality rather than *demonstrating* it. This benchmark replaces the
synthetic-only story with a real-song, published-annotation accuracy report whose
headline number is directly comparable to the chord-recognition literature.

## Decisions (locked during brainstorming)

- **Ground truth:** freely-licensed academic annotations (Isophonics — Beatles/Queen).
  `.lab` files are checked into the repo with attribution + license note.
- **Scale:** a curated pilot of **8–12 songs** (a cross-section, e.g. one Beatles album
  plus a few varied tracks). Easy to grow later.
- **Audio source:** **YouTube URLs via the live `engine.analyze()` pipeline** — the most
  authentic-to-production path. Audio is never committed; the manifest URL is the pointer.
- **Metrics:** **majmin** (headline, comparable to published crema) + **sevenths** +
  **root** (secondary columns).
- **Harness shape:** a **standalone `benchmarks/` script**, *not* collected by pytest.
  Rationale: the output is a report, not a pass/fail assertion, and yt-dlp is blocked from
  datacenter IPs, so this can never run in GitHub Actions CI (this is exactly why tabIt is
  local-first). The existing synthetic `test_accuracy.py` stays as the fast CI regression floor.

## Non-goals

- Not a CI gate. No network eval runs in GitHub Actions.
- Not a fix for any engine defect (slash-chord noise, half-time tempo). The benchmark
  *measures*; it tells us whether those defects are worth chasing. Improvements are
  separate follow-up work.
- Not the full Isophonics set (~180 songs) — sourcing + runtime overkill for a portfolio
  benchmark. The pilot is explicitly a sample, and the report says so.

## Architecture

Standalone module, invoked as `python -m benchmarks.chord_accuracy`.

```
benchmarks/
  __init__.py
  chord_accuracy.py          # the CLI/harness
  manifest.yaml              # the song set (checked in)
  annotations/               # Isophonics .lab files (checked in, CC-licensed + attributed)
    beatles/
      let_it_be.lab
      ...
  results/
    latest.json              # machine-readable, checked in
    latest.md                # the human table, checked in (and pasted into README)
  README.md                  # how to run, licensing/attribution, alignment notes
```

### Shared scoring helper

The mir_eval wiring currently inline in `test_accuracy.py` is extracted into a reusable
function so there is one scoring code path, exercised by the existing synthetic test:

```python
# engine/eval.py  (or benchmarks/scoring.py if we prefer to keep it out of the engine pkg)
def score_chart(ref_intervals, ref_labels, est_intervals, est_labels,
                metrics=("majmin", "sevenths", "root")) -> dict[str, float]:
    """adjust_intervals -> merge_labeled_intervals -> per-metric comparator
    -> weighted_accuracy. Returns e.g. {"majmin": 0.71, "sevenths": 0.58, "root": 0.80}."""
```

`test_accuracy.py` keeps its `assert score >= 0.4` floor; it just delegates the
computation to `score_chart`. Placement (engine vs benchmarks package) is an
implementation detail to settle in the plan; default is `engine/eval.py` since it is
generic MIR scoring, but if we want to keep the engine package free of test-only helpers,
`benchmarks/scoring.py` is acceptable.

### Manifest schema

```yaml
- id: beatles-let-it-be
  title: "The Beatles — Let It Be"
  url: "https://www.youtube.com/watch?v=..."
  lab: annotations/beatles/let_it_be.lab
  ref_duration: 243.0      # seconds the .lab was annotated against (sanity gate)
  offset_sec: 0.0          # manual alignment nudge, calibrated once; usually 0
```

## Data flow (per song)

1. **Analyze** — `engine.analyze(url, created_at=...)`. Reuses the engine's existing chart
   cache (keyed by videoId + engine version): first run ~40s/song, re-runs near-instant.
2. **Duration sanity gate** — compare ingested `source.duration` vs `ref_duration`. If it
   differs by more than **±3%**, attach an `alignment_warning` to that row so a mismatched
   upload is *visible*, not silently depressing the aggregate.
3. **Build estimate** — from `chart.chords`, apply `offset_sec` to intervals, format labels
   as mir_eval chord strings (`root:quality`, with `/bass` for slashes so sevenths/root see
   the full output).
4. **Score** — via `score_chart` (majmin, sevenths, root).
5. **Collect** — per-song scores + warnings + errors.

### Alignment strategy

The annotations are timed to specific studio masters; a YouTube upload that is a
remaster/live/different edit shifts all intervals and unfairly depresses scores. Handling:

- `ref_duration` sanity gate (above) surfaces gross mismatches.
- `offset_sec` corrects a constant intro-padding shift. It is **calibrated manually** (eyeball
  the first chord change vs the `.lab` once per song) — deliberately **not** an automated
  offset-search, which would overfit the estimated intervals to the metric.
- Per-song scores are always shown, so an outlier is diagnosable rather than hidden.

### Aggregation

- Headline = **duration-weighted mean** across songs (consistent with mir_eval
  `weighted_accuracy` within a song), plus an unweighted mean for reference.
- Reported **twice**: `Aggregate (all)` and `Aggregate (aligned)` (excluding
  `alignment_warning` rows), so a bad YouTube match can't quietly distort the headline.

### Error handling

A dead URL, yt-dlp error, or empty chart yields a `null` score + `error` note for that song;
the run continues and exits cleanly. The report shows what succeeded. No exception aborts a
full multi-song run.

## Output

Two committed artifacts:

- `results/latest.json` — per-song scores, warnings, errors, engine version, per-song
  `source.duration`. No extra timestamp beyond what `analyze` already stamps (keeps diffs clean).
- `results/latest.md` — the human table:

```
| Song | majmin | sevenths | root | notes |
|------|-------:|---------:|-----:|-------|
| Let It Be           | 0.74 | 0.61 | 0.83 |            |
| A Hard Day's Night  | 0.55 | 0.40 | 0.68 | ⚠ dur -6% |
| …                   |      |      |      |            |
| **Aggregate (all)**     | **0.68** | … | … | duration-weighted |
| **Aggregate (aligned)** | **0.71** | … | … | excludes ⚠ |
```

The README accuracy section links to `latest.md` and quotes the headline aggregate majmin
with an honest caveat (pilot set, YouTube-sourced, N songs), replacing the synthetic-only
`0.495` claim.

## Testing

- `score_chart` is covered by the existing synthetic `test_accuracy.py` (unchanged floor).
- Add fast unit tests for the pure/deterministic harness logic that need no network: manifest
  parsing, duration-gate threshold, `offset_sec` application to intervals, aggregation
  (duration-weighted mean, all-vs-aligned split), and the markdown/JSON rendering. These run
  in CI.
- The end-to-end network run itself is manual/local and verified by inspecting the produced
  `latest.md`.

## Licensing / attribution

Isophonics annotations are freely available for research. `benchmarks/README.md` states the
source, license, and attribution. Only `.lab` text is committed; no audio.

## Rollout

1. Build harness + shared scorer + unit tests.
2. Curate 8–12 songs, fetch annotations, calibrate `offset_sec` per song.
3. Run locally, commit `results/latest.{json,md}`.
4. Update README accuracy section to cite the real number.
```
