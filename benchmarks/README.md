# tabIt chord-accuracy benchmark

Scores the engine's chord output against published Isophonics annotations with
mir_eval (majmin / sevenths / root weighted accuracy). Each song is run through
the live `engine.analyze()` YouTube pipeline — the same path the product uses.

## Run

```bash
source .venv/bin/activate
python -m benchmarks.chord_accuracy        # uses benchmarks/manifest.yaml
```

Optional: `--manifest path/to/other.yaml`.

**Local-only.** yt-dlp is blocked from datacenter IPs, so this never runs in CI
(this is why tabIt is local-first). The first run is ~40s/song; the engine caches
charts by videoId + engine version, so re-runs are near-instant.

Results are written to `results/latest.json` (full detail) and `results/latest.md`
(the human table). Both are committed.

## The song set

A curated 11-song cross-section of the Isophonics Beatles annotations, spanning
simple three-chord songs (Twist and Shout) to harmonically rich ones (Something,
While My Guitar Gently Weeps). It is a **pilot sample**, not the full 180-song
dataset — the headline number is reported with that caveat.

## Alignment

The annotations are timed to specific studio masters. A YouTube upload that is a
remaster, live take, or different edit can shift every interval and unfairly
depress the score. Two guards:

- **`ref_duration`** (per song, pre-filled from each annotation's last interval)
  flags an upload whose fetched length drifts more than ±3% from the master. The
  flag shows in the results table (`⚠ dur ±N%`); it does not abort the run.
- **`offset_sec`** corrects a constant intro-padding shift, applied to the
  estimated intervals before scoring. Calibrate it **by ear, once per song**
  (compare the upload's first chord change to the first non-`N` interval in the
  `.lab`); it is deliberately *not* auto-searched, which would overfit the metric.

Per-song scores are always shown, so a misaligned upload is visible rather than
hidden in the aggregate. The aggregate is reported twice — `all` and `aligned`
(excluding flagged songs).

## Finishing the benchmark (operator checklist)

1. Fill each `url` in `manifest.yaml` with a matching YouTube upload (prefer
   official "- Topic" / remaster uploads; avoid live/edits).
2. `python -m benchmarks.chord_accuracy` and note any `⚠ dur` flags or low rows.
3. For flagged/low songs, set `offset_sec` by ear and re-run (cached, fast). Swap
   the URL if a song is a genuinely different recording a constant offset can't fix.
4. Commit `results/latest.json` and `results/latest.md`, then cite the headline
   `aligned` majmin in the repo README.

## Annotations — source, license, attribution

Isophonics Beatles chord annotations, © Centre for Digital Music, Queen Mary
University of London, distributed for research use. Only the `.lab` annotation
text is committed here — **no audio**.

Attribution: C. Harte, *Towards Automatic Extraction of Harmony Information from
Music Signals*, PhD thesis, Queen Mary University of London, 2010.
Dataset: <http://isophonics.net/content/reference-annotations-beatles>.
