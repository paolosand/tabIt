# tabIt

Turn any song into a synced, play-along guitar chord sheet — detect the **chords**,
**key**, and suggested **scales**, and follow along karaoke-style with playback.

End goal: a Chrome extension that overlays this on YouTube. First deliverables: a Python
MIR engine that turns audio into a "chord chart" JSON, and a React web app that renders it
synced to the YouTube IFrame player.

> Portfolio / learning project. Success = correctness + a demo worth showing off.
> Honest about the accuracy ceiling (~72% on 7ths; even human experts agree only ~54% on
> complex chords) — the UI surfaces per-chord confidence rather than pretending.

## Architecture (three layers)

| Layer | What | Status |
|---|---|---|
| **1 — MIR engine** (Python) | audio → chords + key + scales + beat grid → chart JSON | 🏗️ planned |
| **2 — Web app** (React + FastAPI) | paste URL / drop file → YouTube player + synced sheet | 📋 spec'd |
| **3 — Chrome extension** (MV3) | overlay the sheet on youtube.com; thin client over the same API | 🔮 later cycle |

The **chart JSON is the shared contract** — the web app and the future extension are both
just renderers of it.

## Engine pipeline

`ingest → separate (Demucs) → beats (librosa) + key (Essentia) + chords (crema) + bass (crepe) → post-process → chart JSON`

The "push the bounds" bit: run the chord model on the harmonic (drums-removed) mix **and**
track the isolated bass stem in parallel, then reconcile to emit slash chords (`C/G`) — which
most tools skip entirely.

## Docs

- **Design spec:** [`docs/superpowers/specs/2026-07-09-tabit-design.md`](docs/superpowers/specs/2026-07-09-tabit-design.md)
- **Engine implementation plan:** [`docs/superpowers/plans/2026-07-09-tabit-engine.md`](docs/superpowers/plans/2026-07-09-tabit-engine.md)

## Progress

### Sub-project 1 — MIR engine (current)
- [ ] Task 0 — Project scaffolding + dependency smoke test
- [ ] Task 1 — Chart schema (`schema.py`)
- [ ] Task 2 — Scale suggestions (`scales.py`)
- [ ] Task 3 — Audio ingest (`ingest.py`)
- [ ] Task 4 — Beat/tempo tracking (`beats.py`)
- [ ] Task 5 — Key detection (`key.py`)
- [ ] Task 6 — Chord recognition (`chords.py`)
- [ ] Task 7 — Source separation (`separate.py`)
- [ ] Task 8 — Bass-note / slash-chord detection (`bass.py`)
- [ ] Task 9 — Post-processing (`postprocess.py`)
- [ ] Task 10 — Pipeline + CLI (`pipeline.py`, `cli.py`)
- [x] Task 11 — Accuracy harness (`mir_eval`) — measured **0.495** majmin weighted accuracy on a synthesized Am→F→C→G fixture (`tests/integration/test_accuracy.py`); a real-song accuracy floor is a documented follow-up (see task-11 report)

### Sub-project 2 — Web app (FastAPI + React)
- [ ] Not yet planned (plan written after the engine produces real charts)

### Sub-project 3 — Chrome extension
- [ ] Later cycle
