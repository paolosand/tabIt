# tabIt Extension — Beat Ribbon (compact panel) Design

**Date:** 2026-07-10 · **Status:** approved (mockup A selected in visual companion)

## Problem

The extension's expanded panel is a direct port of the web app's full-page sheet (~650px
of vertical chrome: stacked chips + transpose rows, 420px sheet, generous padding). Below
a YouTube player on a typical 900px-tall screen there is only ~250–300px, so the user must
page-scroll to see the chords — defeating "read the chords while watching the video."
Separately, the sheet gives no warning of *when* the next chord lands: the highlight just
jumps. Reference the user likes: Chordify's beat grid (one cell per beat, current cell
advancing beat-by-beat).

## Decision

Replace the default expanded view with a **beat ribbon** — a single horizontal strip of
beat cells in tabIt's paper style — and move the existing full sheet behind a toggle.
Extension only; the web app is unchanged. The chart already carries the full beat grid
(`beats: number[]`, e.g. 587 entries for a 5-min song) and `tempo.bpm`, so this is
UI-only work: no engine or API change.

## Components

### 1. `web/src/lib/beats.ts` — shared beat math (new, pure)

Lives beside `music.ts`/`types.ts` and is imported by the extension the same way (global
constraint: shared chart logic lives in `web/src/lib`, no copies). No DOM. Functions:

- `beatIndexAt(beats, t)` → index of the last beat ≤ t (binary search; −1 before first beat)
- `chordBeatSpan(beats, chord)` → `{ firstBeat, beatCount }` for a chord segment
  (beats b with `chord.start ≤ beats[b] < chord.end`; a segment containing no beat
  reports `beatCount: 0` and the ribbon gives it one visual cell)
- `beatWithinChord(beats, chord, t)` → 1-based count for the "beat N / M" counter
- `beatsUntil(beats, t, nextChordStart)` → whole beats until the next chord (footer)

### 2. `extension/src/overlay/Ribbon.tsx` — the strip (new)

- One cell per beat, windowed around "now" (render ± ~24 cells, not all 587).
- Cell: 44px min-width × 64px; 1px left border `oklch(0.93 0.008 90)`; every 4th beat
  from beat 0 gets a heavier 2px border `oklch(0.82 0.012 90)` as an **inferred** bar
  line (the chart has no downbeat data — approximate by design, documented).
- Chord label (21px, serif, ink `oklch(0.25 0.02 60)`) absolutely positioned on the
  chord's first beat cell; low-confidence (< 0.75) labels use the sheet's muted ink
  `oklch(0.62 0.015 60)`. `N` segments render empty cells, no label.
- Sweep: cells of the current chord already passed get wash `oklch(0.965 0.012 90)`;
  the current beat cell gets the amber marker `oklch(0.87 0.14 85)` (4px radius).
- Beat pips (5px dots) under the current chord's label row: filled `oklch(0.55 0.12 70)`
  for beats consumed, empty `oklch(0.85 0.02 85)` for remaining.
- Auto-scroll: translateX keeps the current beat ~⅓ from the left edge; CSS transition
  ~200ms linear; honors `prefers-reduced-motion` (jump instead of glide). Right edge
  fades out (70px gradient). Past cells scroll off left.
- Transpose: labels rendered through the same `transposeChord` used by the sheet.

### 3. `Panel.tsx` restructure

- **One-line header:** wordmark · `Key D major` · `120 bpm` · `Solo: D major pentatonic`
  · transpose (− / label / +) · collapse. Replaces the stacked chips section + transpose
  row (delete `.tabit-chips-section` usage from the panel's default view).
- **View state:** `view: 'ribbon' | 'sheet'`, default `ribbon`. A "⌄ full sheet" /
  "⌃ ribbon" toggle row (11px, muted) switches; the sheet view reuses the existing
  sheet markup/styles unchanged.
- **Footer:** `Now: **Dmaj7** · Next: **Gmaj7/D#** in 2 beats` + right-aligned
  `beat 6 / 8` (tabular numerals). Last chord → `Next: — (to the end)`. Before the
  first beat → no counter.
- **Fallback:** if `chart.beats.length === 0`, force `view: 'sheet'` and hide the toggle.
- Ad behavior unchanged: `useVideoTime` already freezes time during ads; ribbon dims via
  the existing `.tabit-sheet-dim` treatment and the ad tag shows in the header.

## Data flow

`useVideoTime` (10 Hz, ad-frozen) → Panel computes `beatIndexAt` + current chord (existing
`findCurrentIndex`) per tick, memoized on `(time, transpose)` → Ribbon gets
`{ beats window, currentBeat, chords, transpose }` as props and stays a pure renderer.

## Height budget

Header ~36px + ribbon ~86px + footer ~28px + toggle ~20px ≈ **170px** (vs ~650px today).

## Testing

- `beats.test.ts`: boundaries (t before first / after last beat, exact beat times,
  zero-beat chords, empty beats array) for all four functions.
- `Ribbon.test.tsx`: label on first beat cell only; current-beat amber cell; past-wash;
  pips count; dimmed low-confidence label; window excludes far cells; bar line every 4.
- `Panel.test.tsx`: default view is ribbon; toggle swaps to the existing sheet; empty
  `beats` forces sheet + hides toggle; footer copy incl. "in N beats" and "beat N / M";
  transpose relabels ribbon; existing sheet tests keep passing behind the toggle.
- Live check: rerun the session's headful demo driver on TAWAL3LDzQ4 and verify the
  panel fits below the player at 1440×900 without page scroll.

## Out of scope

Web app ribbon; real downbeat detection (engine backlog); strip-mode auto-hide; editing.
