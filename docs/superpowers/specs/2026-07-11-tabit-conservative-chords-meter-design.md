# tabIt — Conservative Chords + Meter Detection Design

**Date:** 2026-07-11 · **Status:** approved ("looks good for a V1")

## Problem

Real-song charts are noisier than they should be, in three ways the user hit on their own
song ("just a song", `TAWAL3LDzQ4`):

1. **Spurious slash chords** — `Gmaj7/D#`, `A#dim7/G`, `Dmaj7/F`: low-quality CREPE bass
   reads attached to otherwise-correct chords (long-standing engine backlog item).
2. **Exotic qualities at low confidence** — one-off `dim7`/`sus4` reads amid a plain
   progression.
3. **Flicker segments** — chords lasting under ~2 beats that a player would never chart.

Separately, the beat ribbon **hardcodes a bar line every 4th beat** because the chart has
no meter data — "just a song" is not in 4/4, so its bar lines are visibly wrong.

Plus two layout notes from live use: the panel should span the video's full width, and it
can be thinner.

## Decision

A post-processing "conservatism pass" in the engine (no model changes), a dependency-free
meter-detection step emitting new additive chart fields, and ribbon/panel polish in the
extension. `ENGINE_VERSION` bumps 0.1.0 → 0.2.0 so cached charts re-analyze.

## 1. Engine — conservatism pass (post-processing, in order)

Applied after existing chord/bass reconciliation, before the chart is emitted:

- **Slash gating.** Emit `X/Y` only when (a) the bass detection confidence for that
  segment ≥ **0.5** AND (b) Y's pitch class is a chord tone of (root, quality) — chord
  tones resolved from the engine's existing quality→interval table. Otherwise the label
  collapses to plain `X` (bass = root). This replaces any current
  less-strict slash rule; the existing "low-confidence bass must not erase crema's own
  slash chords" invariant (final-review fix cd9772f) is preserved: gating only ever
  *removes* the bass annotation tabIt added, never rewrites crema's root/quality.
- **Quality simplification.** For segments with chord confidence < **0.6** and quality
  outside the trusted set `{maj, min, 7, maj7, min7, N}`: map to the nearest triad —
  `dim, dim7, hdim7 → min`; `aug, sus2, sus4 → maj`; anything unknown → `maj`. Trusted
  qualities are never simplified regardless of confidence (honest `Dmaj7`s stay).
- **Short-segment merge.** A non-`N` segment shorter than **2 local beats** (duration <
  2 × median adjacent beat interval at its position) merges into the adjacent non-`N`
  neighbor sharing more pitch classes with it (tie → the earlier neighbor). Merging
  extends the neighbor's boundary; labels/confidence of the absorber win. `N` segments
  are never created, absorbed, or crossed by a merge. Iterate until no segment violates
  the rule (bounded by segment count).

All three rules are pure functions over the segment list + beat grid → unit-testable
without audio.

## 2. Engine — meter detection

Dependency-free heuristic exploiting a strong prior: **chord changes land on downbeats.**

- Candidates: beats-per-bar k ∈ {2, 3, 4}, phase p ∈ [0, k).
- Score(k, p) = fraction of chord-change times within ±120 ms of a beat whose index ≡ p
  (mod k), minus the chance baseline 1/k (so k are comparable).
- Winner → `meter: { beatsPerBar: k, confidence }` where confidence = margin between the
  best and second-best (k, p) score, clamped to [0, 1]; `downbeats: number[]` =
  `beats[p], beats[p+k], …`.
- Degenerate input (fewer than 8 beats or 4 chord changes) → `beatsPerBar: 4, phase 0,
  confidence: 0` (explicit "we don't know", ribbon still renders).
- 6/8 caveat (documented): the beat tracker typically emits dotted-quarter beats for
  compound meters, so grouping detection lands on 2 or 3 — correct bar lines, even if
  the notated meter differs. Neural downbeat tracking (madmom / allin1) stays on the
  backlog as the accuracy upgrade; both have install-pin risk this stack has been burned
  by before.

## 3. Chart schema (additive, back-compatible)

`web/src/lib/types.ts` `Chart` gains optional fields — old cached charts stay valid:

```ts
meter?: { beatsPerBar: number; confidence: number };
downbeats?: number[];
```

Python chart model gains the same (always emitted by the new engine). `schemaVersion`
stays 1 (additive); `ENGINE_VERSION` 0.1.0 → 0.2.0 (cache key changes, songs re-analyze
on next request).

## 4. Extension — ribbon meter honesty + layout

- **Bar lines from downbeats.** `Ribbon` accepts optional `downbeats`; bar-start cells
  are beats whose timestamp is in the downbeat set (index lookup via `beats`), falling
  back to the current every-4th rule when absent/empty. The `beat N / M` footer and pips
  are unchanged (they're chord-relative, not bar-relative).
- **Full video width.** `.tabit-panel` horizontal padding 5vw → 0; the paper card spans
  the host (which already matches the player column). Card keeps its own internal
  padding.
- **Thinner.** Beat cells 64px → 48px tall (labels 21px → 19px, label top 10px → 6px,
  pips bottom 6px → 4px), `.tabit-ribbon` height 86px → 64px, header padding 8px → 6px,
  toggle padding tightened. Target panel height ≈ 120–130px (from ~150px content /
  ~247px measured with paddings).

## Verification

- Unit tests per engine rule, including: confident-but-non-chord-tone bass gets gated;
  low-confidence `dim7` simplifies while high-confidence `dim7` survives; merge respects
  `N` boundaries and pitch-class tie-break; meter heuristic recovers k and phase from
  synthetic 3/4 and 4/4 beat+chord grids (with jitter), and reports confidence 0 on
  degenerate input.
- Existing engine invariant tests (label formatting, slash preservation from crema) keep
  passing.
- Extension: Ribbon downbeat bar-line tests (3-beat bars render correctly; fallback
  without downbeats); panel width/height not unit-testable — verified live.
- Live: re-analyze `TAWAL3LDzQ4` (engine bump busts cache), verify in headful Chromium:
  bar lines match the song's real meter, chart reads conservative (no spurious slashes),
  panel spans the video width, height ≈ 130px. User eyeballs against what they play.

## Out of scope (backlog)

Beat *placement* drift (beat-tracker phase/tempo errors — separate item if still felt
after this); madmom/allin1 neural downbeats; web-app ribbon; time-signature display in
the UI header.
