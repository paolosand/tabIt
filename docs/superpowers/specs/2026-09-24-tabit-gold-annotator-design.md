# tabIt Gold-Set Annotator — Design

Date: 2026-09-24
Status: Draft — awaiting review

## Problem

Users report that chords are "not always accurate" and that transitions land badly on
modern guitar songs (Beabadoobee — *Write Me A Letter*, Lizzy McAlpine — *Over Country*).
The two existing benchmarks cannot see this: the 11-song Beatles pilot and the 9-song
Billboard pilot are 1958–1991 pop/rock, both use published annotations that crema's
training corpus may overlap (unverified), and neither measures transitions directly. There
is no public labeled data for modern indie/acoustic guitar music.

The fix has to start with **ground truth on the songs the user actually plays**. This spec
covers the tool that produces it: a dev-only annotation screen that starts from the
engine's own chart (so correct output is confirmed, not retyped), lets the user correct it
by ear in scale degrees, and writes `.lab` files the existing scorer already reads.

The output is an **evaluation set** (10–30 songs), not a training set. It is the input to
finding which pipeline stage is failing, tuning thresholds, and comparing candidate chord
models. Model training is explicitly later, if ever.

## Decisions (locked during brainstorming, 2026-09-23/24)

- **Home:** a new `Annotate` screen inside the existing `web/` app, reachable only under
  `npm run dev` at `#annotate`. Not linked from Landing; absent from production builds.
- **Assisted by default.** The engine's chords load as pale "ghost" chips. Only chips the
  user acts on become labels; everything else exports as `X` (ignored by the scorer).
  A per-song **blind** toggle hides the engine's chords; roughly one song in four should be
  labeled blind to measure anchoring bias.
- **Layout:** lead-sheet rows (4 bars per row), chosen over a timeline strip and a
  chord-change list via live mockups.
- **Vocabulary:** root + {maj, min, dom7, min7, maj7} + `N` (no chord) + `X` (unsure).
  This is exactly the engine's `TRUSTED_QUALITIES` (`engine/postprocess.py:83`).
  Diminished/augmented have no entry keys in v1: mir_eval ignores them in `majmin` and
  `sevenths` (verified), and mislabeling one as a triad is worse than leaving it `X`.
- **7ths are safe to guess.** Verified against mir_eval: a reference `G:7` vs estimate
  `G:maj` scores 1 on `root` and `majmin`, 0 on `sevenths`. Only the separate `sevenths`
  score cares about the distinction.
- **Times are seconds, not beat indices**, so a later beat-tracker change never
  invalidates labels.
- **Labels are stored as absolute chords; degrees are a display/entry convenience.** See
  "Key changes".
- **Persistence:** JSON is the source of truth, written to disk in the repo by a dev-only
  Vite middleware. The product API (`api/`) gets no new endpoints.
- **Audio is never stored.** A song is identified by its YouTube ID; playback is the
  YouTube iframe.

## Non-goals

- Not the scoring upgrades (boundary F-measure, `X`-aware weighting, per-stage comparison,
  manifest generation). Those are a separate spec that consumes this tool's output.
- Not an engine change and not model training.
- No diminished/augmented entry keys, no key changes within a song, no chord-audition
  synth, no waveform, no multi-user editing, no assisted-suggest workflow for building
  training data.
- Not shipped in the extension or the production web build.

## Architecture

```
web/
  vite.config.ts                     # registers the dev-only gold plugin
  vite-plugin-gold.ts                # /__gold middleware (dev server only)
  src/
    App.tsx                          # DEV-guarded #annotate route (React.lazy)
    annotate/
      Annotate.tsx                   # resume list + new-song URL input + editor
      AnnotateSheet.tsx              # lead-sheet rows, chips, cursor, playhead
      TopBar.tsx                     # video, key, grid controls, transport, palette
      useAnnotator.ts                # reducer, undo/redo, autosave
    lib/gold/
      types.ts                       # GoldFile schema
      degrees.ts                     # key/mode → palette, chord ↔ Roman numeral display
      spans.ts                       # place / split / replace / clear / repeat / nudge
      grid.ts                        # ½× / 1× / 2× derivation, nudge, bars, latency snap
      lab.ts                         # GoldFile → .lab text (all-labeled and sure-only)
    playback/YouTubePlayer.tsx       # extended: seekTo / play / pause / rate / width prop
benchmarks/gold/annotations/
  <videoId>.json  <videoId>.lab  <videoId>.sure.lab      # committed, no audio
tests/…                              # one Python contract test (see Testing)
```

**Data flow.** The user pastes a YouTube URL. If `benchmarks/gold/annotations/<id>.json`
already exists the tool loads it and does *not* re-fetch (so an engine upgrade never
reshuffles an existing grid). Otherwise it calls the existing `analyzeUrl` + `pollJob`
(`web/src/lib/api.ts`); a cached chart returns immediately, an uncached one runs the
~50 s analysis behind the existing progress UI. The chart supplies beats, key, duration and
engine chords, which are snapshotted into the new JSON.

**Player.** `YouTubePlayer.tsx` currently exposes only `getCurrentTime` at a fixed 300 px.
It is extended (backward-compatibly — `Sheet` keeps working) with `seekTo`, `play`,
`pause`, `setPlaybackRate`, and a `width` prop. If a video refuses embedding (some label
uploads do), the tool shows a clear error with an "open on YouTube" link; a local-audio
fallback is deferred.

## Data model

```
benchmarks/gold/annotations/<videoId>.json
{
  "schemaVersion": 1,
  "videoId": "vjr9Madg_sI", "title": "…", "url": "…", "duration": 195.0,
  "key":  { "tonic": "C", "mode": "major", "source": "engine" | "user" },
  "grid": { "factor": 1, "nudgeSec": 0.0, "beatsPerBar": 4, "downbeatBeat": 1 },
  "beats": [ … ],                                  // engine beat snapshot (raw)
  "engine": { "version": "0.2.1", "chords": [ {start,end,root,quality,label,confidence} ] },
  "blind": false,
  "spans": [
    { "start": 3.2, "end": 10.7, "root": "A", "quality": "min", "label": "A:min",
      "flag": "sure" | "guess" | "skip",
      "source": "confirmed" | "edited" | "manual" }
  ],
  "updatedAt": "…"
}
```

- **Invariants:** `spans` sorted, non-overlapping, `0 ≤ start < end ≤ duration`. `quality`
  ∈ {maj, min, dom7, min7, maj7, N, X}. `X` spans have `root: null`, `flag: "skip"`.
- **Effective grid** = `beats` transformed by `grid` (`factor` ½ keeps every other beat, 2
  inserts midpoints; then `nudgeSec` shifts; `downbeatBeat` and `beatsPerBar` define bars).
  Changing the grid never moves stored spans; chips re-render on the nearest beat.
- **Provenance** is assigned by the reducer at the moment of the action:
  `confirmed` (Enter on an untouched ghost chip), `edited` (started from a ghost chip and
  changed label/timing/extent, including any later edit of a `confirmed` span), `manual`
  (no ghost chip beneath, or blind mode). There is no operation log: diffing the `engine`
  snapshot against final `spans` later yields splits (missed changes), replaces (wrong
  chords), boundary moves (timing) and clears (spurious chords).
- **Ghost chips outside the vocabulary** (engine dim/aug/sus/6/9, and all inversions) are
  shown and confirmed as their triad-reduced form (engine `SIMPLIFY_MAP`), bass dropped —
  inversions are ignored by every metric (`engine/eval.py`).
- **Unreviewed = absent.** There is no "unreviewed" span; regions without a span export as
  `X`. Partial labeling (first 90 s of a song) is first-class.

### Export (`lab.ts`)

- `<id>.lab`: sure + guess spans as Harte labels (`A:min7`, `G:7`, `C:maj7`, `N`); `skip`
  spans and gaps → `X`. Quality map is the inverse of `engine/eval.py::MIR_QUALITY`.
- `<id>.sure.lab`: sure spans only; everything else `X`.
- Both files cover `0 → duration` contiguously, times to 3 decimals, adjacent `X` merged.
- The Python scorer needs no degree math: it reads `label` and `flag`/`source` from JSON
  and the `.lab` files as-is.

## Editing model

- **Rows:** 4 bars per row, `beatsPerBar` columns per bar (engine meter confidence is
  0.01–0.23 across the cached songs, so the user sets beats/bar and which beat is "1"; a
  partial first bar is padded).
- **Playhead** (orange) follows playback; rows auto-scroll. **Cursor** is the beat a key
  press lands on: it follows the playhead while playing, and is moved by click or arrows
  when paused.
- **Extension rule (confirmed by the user):** a chord lasts until the next chord, as on a
  printed chord sheet. Placing a digit on a ghost chip's first beat *replaces* it over the
  chip's extent; on a later beat inside a chip it *splits* (the head stays a ghost, the new
  chord runs to the chip's end). In an empty region a new chord provisionally runs to the
  end of its bar, and when a later chord is placed after a gap the preceding span
  auto-extends to meet it (only across gaps of up to 4 bars, so jumping ahead never silently
  labels a long stretch). Only the *last* chord of a labeled run keeps the provisional
  one-bar length, because nothing after it says where it ends.
- **Flags:** new/confirmed/edited spans default to `guess` (matching how the user labels);
  `s` toggles `sure`.

| Key | Action |
|-----|--------|
| `1`–`7` | place/replace the diatonic chord for that degree (quality from the key: in C major `6` → Am) |
| `b` then `1`–`7` | flatted degree (`b7` → B♭ in C) |
| `m` / `d` / `j` | toggle minor/major · toggle ♭7 (G→G7, Am→Am7) · toggle maj7 |
| `n` / `x` | no chord · unsure (`X`) |
| `s` | toggle sure |
| `Enter` | confirm the ghost chip under the cursor, advance to the next |
| `Backspace` | clear the chip to an unlabeled gap |
| `←` `→` / `↑` `↓` | cursor ∓1 beat / ∓1 row |
| `Space` | play / pause |
| `⌘Z` / `⇧⌘Z` | undo / redo (200 steps) |
| `[` `]` | nudge the chord's start ∓1 beat *(slice 2)* |
| `R` | repeat the previous N bars (default 4) at the cursor, advance N *(slice 2)* |
| `L` | loop the current bar *(slice 2)* |

Minor keys use natural-minor defaults (`i ii° III iv v VI VII`; press `m` for a major V).
The two diminished degrees (vii° in a major key, ii° in a minor key) default to the **minor
triad**, because `dim` is outside the v1 vocabulary. A flatted degree (`b` prefix) defaults to
a **major** triad (♭VII, ♭VI and ♭III are almost always major in pop).

**Tap-along** (optional, slice 2): while playing at half speed, keys stamp at the nearest
beat minus a latency allowance (default 0.15 s, adjustable). Paused placement is exact.

### Key changes

Absolute chords are the source of truth — a confirmed engine chord is a claim about the
sounding chord, so re-keying must not transpose it. Changing the key with existing spans
asks: **keep the chords** (default; degrees are re-expressed) or **transpose the chords**
(keep degrees). The key picker says "set this first". This replaces the earlier sketch in
which degrees were canonical and re-keying rewrote every label.

## Grid trust

- **Badge:** BPM plus beat-spacing looseness (coefficient of variation; initial warning
  threshold 0.08 — McAlpine 0.11 warns, Beabadoobee 0.04 does not).
- **½× / 1× / 2×** selector for tempo doubling (a known engine issue).
- **Global nudge** in 10 ms steps.
- **Click track** (slice 2): a tick on each effective beat via WebAudio. Playback time from
  the YouTube iframe is coarse (~100 ms polling), so the click jitters by roughly ±50–100 ms —
  adequate for "half a beat off" or "drifting", not for millisecond tuning.
- **Rubato songs stay approximate** (one global offset cannot follow drift). The scoring
  spec's boundary metric should use a ±0.5 s tolerance so grid error below ~0.25 s does not
  corrupt results. An off-grid stamp at the exact playhead time is a later slice.

## Dev-only middleware (`vite-plugin-gold.ts`)

- Registered via `configureServer`, so it exists only under `vite dev`, on localhost.
- `GET /__gold` → list `{videoId, title, updatedAt, labeledSeconds}`;
  `GET /__gold/<id>`; `PUT /__gold/<id>` (JSON body, 2 MB cap).
- `<id>` must match `^[A-Za-z0-9_-]{11}$` and equal `videoId` in the body, so no path can
  escape `benchmarks/gold/annotations/`. The body is validated against the invariants above.
- The **middleware generates both `.lab` files** from the JSON using the shared `lab.ts`,
  so there is one implementation. Writes are temp-file + rename; JSON is pretty-printed
  with stable key order for clean git diffs.
- **Autosave:** client debounces 500 ms; indicator shows saving / saved ✓ / save failed.
  On failure the draft stays in `localStorage` (`tabit:gold-draft:<id>`) and is re-sent on
  the next change; on load a draft newer than the file's `updatedAt` wins and is re-PUT.

## Testing

- **Unit (vitest, existing setup):** `degrees` (major/minor palettes, `b`, `m`/`d`/`j`),
  `spans` (place/split/replace/clear/repeat/nudge, extension rule, provenance,
  invariants), `lab` (gaps → `X`, `0 → duration` coverage, sure-only file, `N`),
  `grid` (½×/2×, nudge, bar padding, latency snap).
- **Middleware:** handler tested against a temp dir — ID validation, traversal attempts,
  size cap, atomic write, list.
- **Component (Testing Library + fake player):** digit places a chip, Enter confirms,
  digit on a mid-chip beat splits, undo, autosave call.
- **Python contract test:** a committed sample `.lab` with `X` gaps loads through
  `engine.eval.load_lab`, and `score_chart` ignores the `X` spans.
- **Dev-only proof:** after `vite build`, the production bundle contains no `__gold`
  reference (guards the `import.meta.env.DEV` split).
- **Not automatable:** the real YouTube iframe (jsdom cannot host it; YouTube also cuts
  signed-out automation streams after ~45–60 s). Verified by hand.

**Definition of done:** the user labels ~60 s of a real song, reloads and finds it intact,
and the exported `.lab` scores through the existing runner with no converter.

## Build order

- **Slice 1 (testable in one sitting):** load/resume a song, ghost chips, digit + quality
  entry, Enter / split / replace / clear, undo, beats-per-bar + downbeat controls and a
  read-only grid badge (BPM + looseness), autosave and export. Every span is `guess` in
  this slice, so `.sure.lab` is empty until the toggle lands.
- **Slice 2:** `R` repeat, chord nudge `[` `]`, the `s` sure toggle, the grid controls
  (½×/2× and global nudge), loop-bar, click track, blind toggle, tap-along, off-grid stamp.

## Follow-up (separate specs)

- **Scoring upgrades:** generate `benchmarks/gold/manifest.yaml` from the JSON files;
  weight songs by *labeled* duration (today the runner weights by the full `.lab` span, which
  would overweight partially labeled songs); boundary F-measure; per-stage comparison (raw
  crema → beat-snap → `merge_short`); report by provenance and by sure/guess tier. Note
  `engine.analyze()` has no disk cache, so scoring re-runs the engine (~50 s/song) unless the
  helper's chart cache is reused.
- **Engine fixes / model comparison** driven by those results, behind the existing
  `analyze(chord_model=…)` seam.

## Risks and open items

- The one-bar default for the last chord of a labeled run is a guess about how labeling
  feels; expect to tune it after the first real session.
- Some label-hosted videos disable embedding; the tool must fail clearly. A local-audio
  fallback is deferred.
- Click-track timing is approximate (iframe jitter).
- The gold set is committed to a public repo by default (chord labels only, no audio),
  consistent with the Beatles and Billboard `.lab` files. Gitignoring it is a one-line change.
- Whether crema's training data overlaps the two existing benchmarks is unverified; the
  gold set sidesteps the question rather than answering it.
