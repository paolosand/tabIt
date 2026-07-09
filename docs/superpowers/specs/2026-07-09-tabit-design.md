# tabIt — Design Spec

**Date:** 2026-07-09
**Status:** Approved (brainstorming complete; ready for implementation planning)
**Scope of this doc:** Layer 1 (MIR engine) + Layer 2 (web app). Layer 3 (Chrome extension) is a later cycle and is only sketched here for continuity.

---

## 1. Summary

**tabIt** takes a song (from a YouTube URL or an uploaded audio file) and produces a synced,
Ultimate-Guitar-style chord sheet that follows along with playback — showing the current chord,
the next chord, the detected key, and suggested scales to solo with. The end-goal product is a
Chrome extension that overlays this directly on youtube.com; the first deliverable is a web app
that proves the analysis engine and the synced-playback experience.

**Primary goal:** a polished **portfolio / learning demo**. Success = correctness + "wow factor"
in a demo that can be shown off. Legal and scale concerns are handled sanely but not
productionized.

**v1 capabilities (must-have):**
- Chord progression + per-chord timeline, synced to playback.
- Key detection (tonic + mode).
- Scale / soloing suggestions derived from the key.

**Explicitly deferred (not v1):**
- Lyric-synced karaoke sheet (transcription + word alignment) → v2.
- allin1 section labels (verse/chorus/bridge) → v1.5.
- Chrome extension → later cycle.
- Music-foundation-model features (MERT/MusicFM) → documented research stretch.

---

## 2. Context & prior art

Automatic chord recognition is a real, mature MIR problem. Reference products already do the
end-to-end version of this: **Chordify** (paste YouTube URL → synced chord sheet),
**Chord AI**, **Moises**, **Yalp**. Existing Chrome extensions in this exact niche
(**YouChords**, **Chord Finder**) are precomputed/database-backed and generally weak on accuracy —
no dominant high-accuracy incumbent, which leaves a genuine wedge.

**The accuracy ceiling is a structural fact, not a tooling gap.** State-of-the-art automatic chord
estimation (ACE) plateaus at:

| Metric (mir_eval WCSR) | Realistic SOTA |
|---|---|
| maj/min | ~82–84% |
| triads | ~76–78% |
| sevenths | ~72% |
| tetrads | ~65% |
| rare qualities (class-wise) | <45% |

Even expert human annotators only agree ~73% on maj/min and ~54% on complex labels
(Koops et al., JNMR 2019; Humphrey & Bello, ISMIR 2015 — the "glass ceiling" paper). Consequently:

- **Set expectations honestly:** "great for practice, wrong on hard songs."
- **Demo with simple pop/rock** so the tool shines.
- **Surface per-chord confidence** in the UI (dim/flag shaky guesses) — this turns the ceiling into
  an honest feature rather than a hidden failure.
- **Differentiation angle:** tabIt *attempts* 7ths and slash chords where most tools give only
  maj/min, and is honest about its uncertainty.

---

## 3. Architecture — three layers

```
LAYER 3 (later): Chrome MV3 extension
  overlays the synced chord sheet directly on youtube.com — thin client over the same API
        ▲ reuses the exact same JSON API
LAYER 2 (v1 demo surface): React web app
  paste URL / drop file → YouTube IFrame player + chord sheet that highlights the current
  chord synced to getCurrentTime()
        ▲ HTTP: POST /analyze → chart JSON
LAYER 1 (the hard/impressive part): Python MIR engine
  audio in → chords + key + scales + beat grid → chart JSON. FastAPI service,
  cached per videoId, audio discarded after analysis.
```

**Core principle:** the **chart JSON document is the shared contract.** Both the web app and the
future extension are pure renderers of it. Nail the schema once and Layer 3 becomes a thin wrapper
over data the engine already produces.

---

## 4. Layer 1 — the MIR engine

A pipeline of small, independently-testable stages, each with one job and a clear data contract.

```
audio in ──▶ [1 Ingest] ─▶ mono WAV (+ duration)
                │
       [2 Separate] Demucs htdemucs_6s (one pass)
       ├─ bass stem            ─────────────┐
       ├─ "no-drums" harmonic mix ─▶ chords  │
       └─ (guitar/piano/vocals stems avail.) │
                │                            │
   ┌────────────┼───────────────┬───────────┴────┐
   ▼            ▼               ▼                ▼
[3 Beats]  [5 Key]         [4 Chords]      [4b Bass note]
librosa    Essentia        crema (ACE)     Demucs bass →
beat_track KeyExtractor    structured,     crepe-notes
→ grid,BPM (shaath)        slash-capable   → root/segment
   │            │               │                │
   └─────┬───────┴──────┬────────┴────────────────┘
         ▼              ▼
  [6 Post-process]  [7 Scale mapping]
  smoothing,        key+mode → scales
  beat-snap,        (pure theory)
  key priors,
  merge, attach
  slash bass
         │
         ▼
  [8 Chart JSON] ← shared contract
```

### Stage details & library choices

1. **Ingest** (`ingest.py`) — `yt-dlp` (URL) or uploaded file → `ffmpeg` → mono WAV + duration.
   Audio is deleted after analysis; only derived JSON persists (never store source audio).
2. **Separate** (`separate.py`) — `demucs` (`htdemucs_6s`, via the maintained `adefossez/demucs`
   fork). Fast on Apple Silicon (~5–15s/song). Produces the isolated **bass stem** (strong quality;
   used for slash chords) and a **drums-removed harmonic mix** (fed to the chord model). Guitar
   stem usable; piano stem weak (do not rely on it). **Fallback:** `librosa.effects.hpss`
   (near-zero cost, percussion removal only) when Demucs is unavailable.
3. **Beats/tempo** (`beats.py`) — `librosa.beat.beat_track` → beat grid + BPM. Used to snap chord
   changes to beats. *(Stretch v1.5: `allin1` for downbeats + section labels.)*
4. **Chords** (`chords.py`) — **`crema`** (pip-installable; structured output = root + bass +
   pitch-classes; natively emits slash chords; best verified hard-chord numbers of any
   ready-to-use tool: ~72.9% sevenths / ~67% tetrads). Run on the harmonic (drums-removed) mix.
   Exposed behind a **swappable model interface** so the model can be upgraded to **BTC large-voca
   weights** (`jayg996/BTC-ISMIR19`, clone-and-run) for max accuracy without touching the rest of
   the pipeline. **Fallback:** `chord-extractor`/Chordino (template-based, native 7th + slash
   vocabulary, lower accuracy).
5. **Bass note** (`bass.py`) — the slash-chord "push the bounds" module. Run the Demucs **bass
   stem** through **`crepe-notes`** (monophonic pitch tracker; best-scored on isolated-bass
   transcription, ~72% note F-measure). Yields the bass pitch-class per chord segment.
   *(Fallback: `librosa.pyin`.)*
6. **Key** (`key.py`) — `Essentia` `KeyExtractor` (profile `shaath` for pop/rock). *(Fallback:
   `music21` Krumhansl-Schmuckler.)*
7. **Post-process** (`postprocess.py`) — median-filter noisy frames; snap chord changes to the beat
   grid; merge consecutive identical chords into segments; apply the detected **key as a diatonic
   prior** to clean implausible chords; **reconcile** ACE chord quality with the bass-note tracker —
   when the detected bass ≠ chord root, emit a slash chord (`X/Y`).
8. **Scale mapping** (`scales.py`) — pure music theory, no audio: key + mode → suggested scales and
   positions (e.g., A minor → A minor pentatonic / A natural minor / A Dorian). Trivially testable.
9. **Emit** (`schema.py` / `pipeline.py`) — assemble the Chart and serialize to JSON.

### The "push the bounds" strategy (complex chords)

The validated, no-training recipe to beat maj/min-only tools on hard chords:

> ACE model (`crema`, upgradeable to BTC large-voca) on the harmonic mix, **in parallel** with a
> Demucs-bass → `crepe-notes` tracker, then **reconcile**: take chord quality/extensions from the
> ACE model and the bass note from the bass tracker; emit `X/Y` on disagreement.

This is the ChordCoT architecture minus the LLM — a weekend-scale build, not a research project.
**Honest ceiling:** ~72% sevenths, ~65% tetrads, <45% on rare qualities. Do not expect maj/min-level
accuracy on extended chords — nobody achieves it.

**Documented research stretch (not v1):** self-supervised music-foundation-model features
(MERT-v1-330M, MusicFM) measurably beat CQT/chroma for chords, but are not plug-and-play and MERT
is non-commercial-licensed. Parked as future work.

---

## 5. The chart JSON contract

The single most important artifact — both the web app and the future extension render it. Rich
enough to carry v1 *and* deferred features.

```jsonc
{
  "schemaVersion": 1,
  "source": { "kind": "youtube", "videoId": "dQw4...", "title": "...", "duration": 213.4 },
  "analysis": { "engineVersion": "0.1.0", "createdAt": "..." },  // cache-bust on model upgrades
  "key": { "tonic": "A", "mode": "minor", "confidence": 0.71 },
  "scales": [
    { "name": "A minor pentatonic", "notes": ["A","C","D","E","G"] },
    { "name": "A natural minor",    "notes": ["A","B","C","D","E","F","G"] }
  ],
  "tempo": { "bpm": 120.5 },
  "beats": [0.42, 0.92, 1.41],                 // beat grid (seconds)
  "sections": [],                              // empty in v1; filled by allin1 (v1.5)
  "chords": [
    { "start": 0.42, "end": 2.40, "label": "Am",  "root": "A", "quality": "min", "bass": "A", "confidence": 0.83 },
    { "start": 2.40, "end": 4.38, "label": "F",   "root": "F", "quality": "maj", "bass": "F", "confidence": 0.79 },
    { "start": 4.38, "end": 6.30, "label": "C/G", "root": "C", "quality": "maj", "bass": "G", "confidence": 0.66 }
  ]
}
```

**Deliberate decisions:**
- **Chords stored structurally** (`root` / `quality` / `bass`), not just as a display string →
  transpose, capo, and manual correction recompute the label from parts; also carries the extended-
  chord vocabulary cleanly (`min7`, `maj7`, `sus4`, `dom7`, …).
- **Per-chord `confidence`** → UI can dim/flag shaky guesses (honest UX).
- **`schemaVersion` + `engineVersion`** → cache key component; recompute when the model improves.

---

## 6. Layer 2 — the web app

React + the YouTube IFrame Player API.

```
┌───────────────────────────────────────────────────────────┐
│  [ paste YouTube URL ___________ ]  [Analyze]  or  drop file │
├───────────────────────────────┬───────────────────────────┤
│                               │  Key: A minor   BPM: 120    │
│      YouTube IFrame player     │  Scales: A minor pent...    │
│      (getCurrentTime polled    ├───────────────────────────┤
│       via requestAnimationFrame)│  CHORD SHEET               │
│                               │   Am    F    C/G   G        │
│                               │  ▔▔▔▔ ← current chord lit    │
│                               │   ...next: F (in 1.2s)      │
└───────────────────────────────┴───────────────────────────┘
```

- Poll the IFrame player `getCurrentTime()` on `requestAnimationFrame`; binary-search the `chords`
  array for the active segment; **highlight the current chord + preview the next** — the whole chart
  is known up front, so lookahead is free.
- Chord sheet rendered as a beat/bar grid; current chord highlighted; low-confidence chords dimmed.
- Controls: **transpose / capo** (recompute labels from structured data) and **click-to-edit** a
  wrong chord (local override; no backend write needed for the demo).

**Flow:** paste URL → `POST /analyze {videoId}` → backend checks cache → on miss runs the pipeline
(show progress) → returns chart JSON → frontend renders + syncs. Cache keyed by
`videoId + engineVersion`.

---

## 7. API surface (FastAPI)

Deliberately tiny and identical for the web app and the future extension.

```
POST /analyze        body: { videoId } | multipart file   → 202 { jobId }   (async; secs–mins)
GET  /analyze/{jobId}                                      → { status: pending|done|error, chart? }
GET  /chart/{videoId}                                      → cached chart JSON (fast path)
GET  /health
```

Async submit → poll, because a cold analysis (Demucs + chords on a fresh song) can take up to a
couple of minutes; cache-warm requests are instant.

---

## 8. Project structure

Monorepo with three packages mirroring the three layers.

```
tabit/
├── engine/                  # Layer 1 — pure Python, no web deps. Portfolio centerpiece.
│   ├── ingest.py            #   yt-dlp / file → mono WAV
│   ├── separate.py          #   Demucs htdemucs_6s (+ HPSS fallback)
│   ├── beats.py             #   librosa beat grid
│   ├── chords.py            #   crema (swappable model interface; BTC upgrade path)
│   ├── bass.py              #   Demucs bass → crepe-notes (slash chords)
│   ├── key.py               #   Essentia KeyExtractor
│   ├── scales.py            #   pure theory, zero audio
│   ├── postprocess.py       #   smoothing, beat-snap, key priors, reconcile slash, merge
│   ├── pipeline.py          #   orchestrates stages → Chart
│   └── schema.py            #   Chart Pydantic models + JSON (the contract)
├── api/                     # Layer 2a — FastAPI wrapping engine.pipeline + cache
├── web/                     # Layer 2b — React + YouTube IFrame player
├── extension/               # Layer 3 — stub for later cycle
└── docs/superpowers/specs/  # this design doc
```

---

## 9. Testing strategy

- **Pure modules** (`scales.py`, `schema.py`, `postprocess.py`) → deterministic unit tests, no audio.
- **Audio stages** (chords/key/beats) → test against 1–2 short hand-labeled reference clips
  (e.g., a 30s pop loop with known ground truth); assert accuracy *above a threshold* rather than
  exact (MIR is probabilistic). Score with **`mir_eval`** (chord/key) for real MIREX-style numbers —
  also strong portfolio material.
- **API** → contract tests on endpoints with a mocked pipeline.
- **Web** → component tests on the sync/highlight logic against a fixture chart.

---

## 10. Build phasing

Each phase is a working, demoable increment.

1. **Engine skeleton + schema + scales/key** — Chart JSON out end-to-end with real key + scales,
   chords stubbed. Proves the contract.
2. **Chords + beats + post-processing** — real MIR core (`crema` + librosa); measure with `mir_eval`.
3. **Demucs + slash-chord bass** — accuracy/complexity upgrade (bass stem → crepe-notes → reconcile).
4. **FastAPI + caching** — wrap engine, async jobs.
5. **React web app** — IFrame player + synced highlighting sheet + transpose/capo/edit. **The money demo.**
6. *(Later cycles)* allin1 sections → BTC/foundation-model chord upgrade → Chrome extension (Layer 3).

---

## 11. Risks & mitigations

- **Accuracy ceiling (inherent):** ~72% sevenths, ~65% tetrads. → Honest confidence UX, simple-pop
  demo songs, manual-correction affordance.
- **`yt-dlp` breakage / ToS gray area:** YouTube changes internals; downloading copyrighted audio is
  a ToS gray area. → File-upload fallback for reliable demos; never store source audio, only derived
  chord data; treat as demo-scale, not productionized.
- **Dependency install friction:** `allin1` (NATTEN + madmom + Python ≤3.11) is a known rabbit hole.
  → Deferred to v1.5; core pipeline stays on an easy, Python-3.11+, pip-installable stack.
- **Demucs cost on non-Apple-Silicon / no-GPU machines:** slower. → HPSS fallback; caching per
  videoId so each song is analyzed once.

---

## 12. Layer 3 (later cycle) — Chrome extension notes

Recorded now so the design stays coherent; not part of this spec's implementation.

- Precompute-on-backend architecture; extension is a thin client hitting the same API.
- MV3: content script on `*://www.youtube.com/*` reads the `<video>` element `currentTime` via
  `requestAnimationFrame`; inject a Shadow-DOM overlay (isolated world bypasses page CSP).
- Handle YouTube SPA navigation: listen for `yt-navigate-finish` + `yt-page-data-updated`, dedupe by
  videoId, tear down per navigation (AbortController), account for metadata lag.
- Do **not** `fetch()` the API from the content script (subject to page CORS) — message the service
  worker and fetch there with the API host in `host_permissions`.
- Optional advanced mode: client-side `chrome.tabCapture` → offscreen document → Web Audio for live
  analysis (lower accuracy, no lookahead) — a differentiator, not the core.
