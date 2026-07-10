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
| **1 — MIR engine** (Python) | audio → chords + key + scales + beat grid → chart JSON | ✅ complete |
| **2 — Web app** (React + FastAPI) | paste URL / drop file → YouTube player + synced sheet | ✅ complete |
| **3 — Chrome extension** (MV3) | overlay the sheet on youtube.com; thin client over the same API | 🔮 later cycle |

The **chart JSON is the shared contract** — the web app and the future extension are both
just renderers of it.

## Engine pipeline

`ingest → separate (Demucs) → beats (librosa) + key (Essentia) + chords (crema) + bass (crepe) → post-process → chart JSON`

The "push the bounds" bit: run the chord model on the harmonic (drums-removed) mix **and**
track the isolated bass stem in parallel, then reconcile to emit slash chords (`C/G`) — which
most tools skip entirely.

### Install (engine)

Plain `pip install -e ".[dev]"` is **not sufficient** — crema's legacy build needs an old
`setuptools`, so the build step must be constrained separately:

```
python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]" --build-constraint constraints-build.txt
```

### Run the web app

```
# terminal 1 — API
source .venv/bin/activate
uvicorn api.main:app --port 8000

# terminal 2 — web
cd web && npm install && npm run dev   # http://localhost:5173
```

Paste a YouTube URL (or drop an audio file) on the landing page. First analysis of a
song is cold (~1–3 min: download → Demucs separation → chord/key/beat detection);
repeat submissions of the same video are served instantly from the disk cache
(`data/charts/`, keyed by videoId + engine version).

## Docs

- **Design spec:** [`docs/superpowers/specs/2026-07-09-tabit-design.md`](docs/superpowers/specs/2026-07-09-tabit-design.md)
- **Engine implementation plan:** [`docs/superpowers/plans/2026-07-09-tabit-engine.md`](docs/superpowers/plans/2026-07-09-tabit-engine.md)

## Progress

### Sub-project 1 — MIR engine ✅ complete

`python -m engine.cli <youtube-url|audio-file> -o chart.json` runs the full pipeline end-to-end (~10s on a short clip, Apple Silicon).

- [x] Task 0 — Project scaffolding + dependency smoke test
- [x] Task 1 — Chart schema (`schema.py`)
- [x] Task 2 — Scale suggestions (`scales.py`)
- [x] Task 3 — Audio ingest (`ingest.py`)
- [x] Task 4 — Beat/tempo tracking (`beats.py`)
- [x] Task 5 — Key detection (`key.py`)
- [x] Task 6 — Chord recognition (`chords.py`)
- [x] Task 7 — Source separation (`separate.py`)
- [x] Task 8 — Bass-note / slash-chord detection (`bass.py`)
- [x] Task 9 — Post-processing (`postprocess.py`)
- [x] Task 10 — Pipeline + CLI (`pipeline.py`, `cli.py`)
- [x] Task 11 — Accuracy harness (`mir_eval`) — measured **0.495** majmin weighted accuracy on a **synthetic**, programmatically-generated Am→F→C→G fixture (`tests/integration/test_accuracy.py`), asserted as a regression floor (`>= 0.4`) for that fixture only. **This is not a real-music accuracy claim** — crema is trained on real recordings, so a synthesized-tone clip is out-of-distribution and this number says nothing about accuracy on an actual song. A real-song accuracy floor (licensed/self-recorded, hand-labeled) remains a documented follow-up (see task-11 report)

### Sub-project 2 — Web app (FastAPI + React) ✅ complete

Paste URL / drop file → analyzing screen → synced chord sheet with YouTube (or local
`<audio>`) playback. Verified end-to-end against the real engine on a real song
(Three Little Birds → key **A major** 0.94, A/D/E chord family; cold analysis ~2.5 min,
cache hit <10 ms).

- [x] Task 0 — API scaffolding + `/health` endpoint (`api/main.py`)
- [x] Task 1 — videoId parsing + chart disk cache (`api/videoid.py`, `api/cache.py`)
- [x] Task 2 — Async job store, single-worker executor (`api/jobs.py`)
- [x] Task 3 — Analyze endpoints: submit URL/file, poll job, cached-chart fast path
- [x] Task 4 — Web scaffolding: Vite + React + TS, design tokens, `/api` dev proxy
- [x] Task 5 — Chart types + music utils (transpose, label formatting) mirroring `engine/schema.py`
- [x] Task 6 — API client with job polling + persistent chord-override store (localStorage)
- [x] Task 7 — App state machine + Landing/Analyzing screens (URL + file input, error states)
- [x] Task 8 — Playback layer: YouTube IFrame + local `<audio>` behind one `PlaybackSource`
- [x] Task 9 — Sheet screen: beat-synced highlight, next-chord lookahead, auto-scroll, key/tempo/scale chips, transpose, confidence dimming
- [x] Task 10 — Fix-this-chord popover; edits persist locally and survive reload
- [x] Task 11 — End-to-end verification + docs (this section)

### Sub-project 3 — Chrome extension 🏗️ in progress

MV3 thin client over the same API: a "♪ Get chords" bar injected below the YouTube
player expands into the synced paper sheet (Shadow DOM, SPA-navigation-safe,
ad-aware). Design: [`docs/superpowers/specs/2026-07-09-tabit-extension-design.md`](docs/superpowers/specs/2026-07-09-tabit-extension-design.md) ·
Plan: [`docs/superpowers/plans/2026-07-09-tabit-extension.md`](docs/superpowers/plans/2026-07-09-tabit-extension.md)

- [x] Task 0 — esbuild MV3 scaffold; shared types/music helpers imported from `web/src/lib` (no copies)
- [x] Task 1 — Message contract + watch-page utilities (videoId, ad detection, insertion selectors)
- [x] Task 2 — Service worker: API orchestration, `chrome.storage.session` cache, SW-restart-safe polling
- [x] Task 3 — Content shell: SPA navigation watcher, Shadow-DOM mount/teardown, stale-retry race fixed + regression-tested
- [x] Task 4 — Overlay state machine: collapsed bar → analyzing → sheet/error; page-`<video>` time hook
- [x] Task 5 — The panel: web Sheet ported into the shadow root (sync, lookahead, transpose, ad-pause)
- [ ] Task 6 — Degraded mount fallback + live-stream guard
- [ ] Task 7 — Headful Playwright e2e on real YouTube + run instructions
