# tabIt chord-accuracy benchmark — Billboard multi-genre pilot

Sprint 0 diagnostic (`docs/BETA_ROADMAP.md`): the Beatles-only pilot in
`../` covers one genre/era. This adds a small multi-genre sample to surface
failure modes outside 60s British rock, using the McGill Billboard
Project's chord annotations instead of Isophonics.

## Run

```bash
source .venv/bin/activate
python -m benchmarks.chord_accuracy --manifest benchmarks/billboard/manifest.yaml
```

Same local-only caveat as the Beatles pilot (yt-dlp is blocked from
datacenter IPs — never runs in CI). Results are written to `results/latest.json`
and `results/latest.md`, kept separate from `../results/` so the Beatles
baseline stays independently comparable across sprints.

## The song set

9 songs, 3 per genre bucket, picked from tracks in the McGill Billboard
index that already have `full.lab` chord annotations:

- **Acoustic/singer-songwriter:** Country Road (James Taylor), The Sounds of
  Silence (Simon & Garfunkel), If (Bread)
- **Syncopated/non-4-on-the-floor:** Cold Sweat (James Brown), Super Freak
  (Rick James), Jungle Boogie (Kool & The Gang)
- **Closest available "modern pop" proxy:** Hold On (Wilson Phillips),
  Motownphilly (Boyz II Men), The Power (SNAP!)

The Billboard corpus is a stratified random sample of Hot 100 chart slots
from **1958–1991** — it does not reach genuinely modern pop, so that bucket
is an honest proxy (late-80s/early-90s dance-pop and new jack swing), not a
claim of covering current chart music.

## Format note

Unlike the Isophonics `.lab` files, the Billboard archive's `full.lab` per
track is generated straight from the dataset's own MIREX-style export —
already plain `start end label` text, identical in shape to what
`engine/eval.py::load_lab` and `benchmarks/chord_accuracy.py` already parse.
No format converter was needed for this pilot.

## Alignment

Same two guards as the Beatles pilot (see `../README.md`): `ref_duration`
flags an upload that drifts >3% from the annotated master; `offset_sec`
corrects a constant intro-padding shift, calibrated by ear only if a song is
flagged or scores low. All 9 manifest entries matched their annotation's
`ref_duration` within ±1.3% on the first YouTube upload tried, so no
`offset_sec` calibration was needed for this set.

One swap during song selection: "September" (Earth, Wind & Fire) was
dropped after its only available YouTube uploads (~215s) turned out to be a
genuinely different edit than the ~147.7s annotated in this dataset — a
duration gap that large isn't a constant-offset problem, so it was replaced
with Kool & The Gang's "Jungle Boogie" rather than force a bad alignment.

## Annotations — source, license, attribution

McGill Billboard Project chord annotations, released under a **CC0** license
(public domain). Only the `.lab` annotation text is committed here — **no
audio**.

Dataset: <https://ddmal.music.mcgill.ca/research/The_McGill_Billboard_Project_(Chord_Analysis_Dataset)/>
