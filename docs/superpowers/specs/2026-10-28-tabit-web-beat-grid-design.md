# tabIt Web App — Wrapped Beat Grid Design

**Date:** 2026-10-28 · **Status:** approved (layout selected in visual companion: 16 beats/row)

## Problem

The web app's chord sheet (`web/src/screens/Sheet.tsx`) lays out chords in a 4-column
grid, one cell per *chord*, with a rotated sticker-highlighter behind the current one. The
only warning that a chord is about to change is the footer text ("Now: A · Next: Emaj7 in
7 beats") — the highlight otherwise just jumps. The user finds this unintuitive and prefers
the extension's beat ribbon (`extension/src/overlay/Ribbon.tsx`, see
`2026-07-10-tabit-beat-ribbon-design.md`), where the current-beat cell visibly sweeps
through the song. But the ribbon's windowed, auto-scrolling single row only shows ~6 bars
at a time — the user also wants the whole song visible at once, which the ribbon doesn't
do. Validated in the browser visual companion (`.superpowers/brainstorm/.../layout-v2.html`,
live animated mockup): a grid where every cell is one *beat* (not one chord), wrapped at a
fixed row length, with the "now" cell sweeping left-to-right and wrapping down a row,
satisfies both — approved at **16 beats (4 bars) per row**.

## Decision

Replace the Sheet screen's chord grid with a **wrapped beat grid**: one `<div>` cell per
beat, `rowLen` cells per row (4 bars, meter-aware), current beat highlighted amber and
sweeping through it as playback advances, auto-scrolling vertically to follow — with
manual scroll allowed to look ahead, auto-scroll resuming after a short idle period. Visual
language (amber "now" fill, muted "done" wash) is taken directly from the extension's
`.tabit-beat-now` / `.tabit-beat-done`, not the current rotated highlighter-sticker. Web
app only — the extension's `Ribbon.tsx` is the style reference, not a change target; its
windowed single-row layout is intentionally different (compact strip under a video vs. a
full-page hero view) and isn't being touched.

Everything else on the Sheet screen is unchanged: header (wordmark, title, key/tempo/scales
chips, transpose), the video player, click-to-fix editing via `EditPopover`, low-confidence
dimming, "N" (no-chord) handling, localStorage overrides.

## Components

### 1. `web/src/screens/BeatGrid.tsx` — the grid (new)

Replaces the `.tabit-row`/`.tabit-chord-cell` block currently inline in `Sheet.tsx`
(lines ~303–445). Props: `{ beats, downbeats, meter, chords: decorated[], currentBeatIndex,
onEditChord }` — `decorated` is `Sheet.tsx`'s existing per-chord array (label, isCurrent,
textColor, underline, edited, isEditing already computed there; reused as-is).

- `rowLen = (meter?.beatsPerBar ?? 4) * 4` — 4 bars per row, honoring real detected meter
  with the same 4-beat fallback `Ribbon.tsx` already uses when `downbeats` is empty.
- Row markup: `display: grid; grid-template-columns: repeat(rowLen, 1fr)` — **always**
  `rowLen` columns regardless of how many real beat-cells land in a partial last row, so
  column width never depends on row content (this is the "equally spaced" requirement:
  verified by construction, not by measurement — a short last row leaves empty trailing
  grid tracks rather than stretching its real cells wider).
- Cell: one per beat. `border-right`/`border-bottom` hairline (`oklch(0.93 0.008 90)`);
  bar-start cells (`downbeats` match, or `beatIndex % beatsPerBar === 0` fallback) get a
  heavier left border, mirroring `Ribbon.tsx`'s `tabit-beat-bar`.
- Chord label: rendered once, on the cell where the chord starts (`chordBeatSpan` from
  `beats.ts`) — same `formatLabel`/transpose/low-confidence-dim/underline treatment
  `Sheet.tsx` already computes per chord, just attached to one cell instead of one grid
  slot. "N" segments render no label, not clickable (parity with today).
- Click-to-edit: the chord-start cell's label is the existing `EditPopover` trigger,
  unchanged props/behavior — one click target per chord instead of one per occurrence in
  the old 4-column wrap.
- "Now"/"done": the single beat-cell at `currentBeatIndex` gets a flat amber fill
  (`oklch(0.88 0.14 90)`, matching the extension's `--tabit-amber` token added in the
  brand-handoff pass); cells before it **within the current row** get the muted "done" wash
  (`oklch(0.965 0.012 90)`); earlier rows (already scrolled past) stay at that same wash so
  the played portion of the whole song reads as a visibly lighter region, not just the
  current row.
- No beat-pips — redundant now that every beat already has its own cell; the grid itself
  is the progress indicator.

### 2. `Sheet.tsx` changes

- Replace the `.tabit-row` grid block with `<BeatGrid ... />`.
- Replace `rowRefs`/chord-row auto-scroll `useEffect` with beat-row auto-scroll: compute
  `currentBeatIndex = beatIndexAt(chart.beats, time)` (from `beats.ts`, same helper
  `Ribbon.tsx` uses), scroll the row containing it into view (`scrollIntoView({ behavior:
  'smooth', block: 'center' })`), same pattern validated live in the mockup.
- Manual-scroll override: track `lastManualScrollAt` via a `scroll` listener on the
  container (ignore scroll events fired by the auto-scroll's own `scrollIntoView` — guard
  with a short "programmatic scroll in flight" flag so it doesn't immediately re-trigger
  itself as a manual scroll). Auto-scroll is skipped while `Date.now() - lastManualScrollAt
  < 3000`.
- Keep the "Now: X · Next: Y in Zs" footer as a secondary text summary — no longer the
  primary indicator, but cheap to keep and already wired.
- Remove `HIGHLIGHT_COLOR` and the rotated-sticker marker div (`data-testid="marker"`) —
  dead code once the grid no longer uses it. `Sheet.test.tsx` references to `marker` need
  updating to the new "now" cell (e.g. a `data-testid="beat-now"` on the current cell).

### 3. `DESIGN.md` reconciliation

- Replace the "Highlighter" row's framing (currently: rotated sticker behind the current
  chord, called out under **Signature moments** as "the amber highlighter sweep") with the
  flat beat-cell language now shared across extension and web. Keep the `Highlighter`
  OKLCH token row (still used for the EditPopover's "edited" dot and low-confidence states)
  but update the "signature moment" bullet to describe the beat-grid sweep instead of the
  rotated sticker, since the sticker treatment is being removed from the web app and was
  never in the extension.

## Data flow

`usePlaybackTime(source)` → `time` (unchanged) → `currentBeatIndex = beatIndexAt(chart.beats,
time)` and `currentIndex = findCurrentIndex(chords, time)` (unchanged, still drives the
footer and `EditPopover` state) → `BeatGrid` receives `{ beats, downbeats, meter, decorated,
currentBeatIndex }` as props and stays a pure renderer, same separation `Ribbon.tsx` uses
from `Panel.tsx`.

## Testing

- `BeatGrid.test.tsx` (new): row length matches `meter.beatsPerBar * 4` with a 4-beat
  fallback when `meter` is absent; equal column count on a partial last row; label appears
  only on a chord's first beat cell; "now" cell amber at the right index; "done" wash on
  passed beats including earlier rows; "N" segments render no label and aren't clickable;
  low-confidence dimming and the edited-dot carry over; click opens `EditPopover` with the
  same props as today.
- `Sheet.test.tsx`: update the `marker` test-id references to the new "now" cell; add a
  manual-scroll-pauses-autoscroll case (simulate a scroll event, assert the container
  doesn't jump back until the idle window elapses); existing override/edit/transpose tests
  should need no changes since that logic is untouched.
- `beats.ts` already has full coverage from the ribbon spec — no new math, just a new
  caller.
- Visual: re-run `npm run dev`, load a real song, confirm equal cell spacing at 16/row
  across a song whose chord count doesn't divide evenly by 16, and confirm auto-scroll
  resumes correctly after a manual scroll.

## Out of scope

Extension changes (the ribbon stays as-is — it's the reference, not the target); real
downbeat detection improvements (engine backlog, independent of this); mobile/narrow-width
row-length tuning (ship at 16 fixed, revisit if it reads poorly on small screens); changing
`EditPopover`'s own UI.
