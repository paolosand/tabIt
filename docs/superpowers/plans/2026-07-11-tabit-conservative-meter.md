# tabIt Conservative Chords + Meter Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chart output conservative (gated slash chords, simplified low-confidence exotics, no sub-2-beat flicker segments), detect meter (beats-per-bar + downbeats) so the ribbon draws real bar lines, and polish the panel (full video width, thinner).

**Architecture:** Three pure post-processing rules + a pure meter heuristic in the Python engine (no model changes); additive `meter`/`downbeats` chart fields (Python + TS); the extension's Ribbon consumes `downbeats` for bar lines with an every-4th fallback. `ENGINE_VERSION` 0.1.0 → 0.2.0 busts the disk cache.

**Tech Stack:** Python 3.11 + pydantic + pytest (engine); TypeScript/React/vitest (extension).

**Spec:** `docs/superpowers/specs/2026-07-11-tabit-conservative-chords-meter-design.md`

## Global Constraints

- Work on branch `feat/conservative-meter` (created from `main` in Task 0).
- Engine tests: `source .venv/bin/activate && pytest -q` from repo root (unit suite; integration tests are deselected by default). Run focused files with `pytest tests/engine/test_postprocess.py -q` style paths — **look at `tests/` first to find the real layout/naming and follow it.**
- Extension/web: Node 20 via nvm (`source ~/.nvm/nvm.sh && nvm use 20`); web `cd web && npm test`, ext `cd extension && npm test && npm run typecheck && npm run build`.
- Exact thresholds (from spec): slash gating bass-confidence ≥ **0.5**; quality simplification only when confidence < **0.6**; short segment = duration < **2 local beat intervals**; meter change-alignment tolerance ±**0.12 s**; meter candidates k ∈ {2,3,4}.
- Trusted qualities (never simplified): `{"maj","min","dom7","maj7","min7","N"}` (engine key for a dominant 7th is `dom7`).
- Simplification map: `dim, dim7, hdim7, min6, min9, minmaj7 → min`; `aug, sus2, sus4, 6, 9, maj9 → maj`; unknown → `maj`.
- The crema-slash invariant (final-review fix cd9772f) MUST keep holding: when CREPE has no confident frames for a segment, the segment keeps crema's own bass — gating must not strip it. Gating applies only to CREPE-sourced bass.
- Every mutated segment's `label` is rebuilt via `format_label(root, quality, bass)` — the `ChordSegment.label` derived-field invariant from the engine reviews.
- Chart schema additions are OPTIONAL/additive in TS (`meter?`, `downbeats?`) — old cached charts must stay valid for the web app and extension.

---

### Task 0: Chord-tone table + slash gating

**Files:**
- Modify: `engine/notes.py` (chord-tone intervals), `engine/bass.py` (expose confidence), `engine/postprocess.py` (gate), `engine/pipeline.py` (wiring)
- Test: extend the existing postprocess/bass test files under `tests/` (find them; follow naming)

**Interfaces:**
- Produces (used by Tasks 1–2):
  - `engine/notes.py`: `QUALITY_TONES: dict[str, tuple[int, ...]]` — semitone intervals per quality (all 17 keys of `QUALITY_SUFFIX` plus `"N"` → `()`), and `chord_tone_classes(root: str, quality: str) -> set[str]` returning pitch-class names.
  - `engine/bass.py`: `detect_bass_notes(bass_wav, segments) -> list[tuple[str, float | None]]` — `(pitch_class, median_crepe_confidence)` per segment; `(seg.bass, None)` when no confident frames (None = "crema's own bass, not CREPE's").
  - `engine/postprocess.py`: `reconcile_bass(segs, bass_reads: list[tuple[str, float | None]]) -> list[ChordSegment]` — applies a CREPE bass ONLY when `conf is not None and conf >= 0.5 and pc in chord_tone_classes(seg.root, seg.quality)`; otherwise keeps the segment's existing (crema) bass. Labels rebuilt via `format_label`.

- [ ] **Step 0: Branch** — `git checkout main && git checkout -b feat/conservative-meter`. Then read the existing tests for `postprocess`/`bass` under `tests/` to mirror their fixture style (they construct `ChordSegment(...)` directly).

- [ ] **Step 1: Failing tests.** Add to the postprocess tests (adapt imports/fixtures to the file's existing style):

```python
def _seg(root="A", quality="maj", bass=None, start=0.0, end=2.0, conf=0.9):
    bass = bass or root
    return ChordSegment(start=start, end=end, root=root, quality=quality,
                        bass=bass, confidence=conf,
                        label=format_label(root, quality, bass))

def test_chord_tone_classes_covers_all_qualities():
    from engine.notes import QUALITY_TONES, chord_tone_classes
    from engine.schema import QUALITY_SUFFIX
    assert set(QUALITY_SUFFIX) <= set(QUALITY_TONES)
    assert chord_tone_classes("C", "maj") == {"C", "E", "G"}
    assert chord_tone_classes("A", "min7") == {"A", "C", "E", "G"}
    assert chord_tone_classes("N", "N") == set()

def test_confident_chord_tone_bass_becomes_slash():
    segs = [_seg(root="C", quality="maj")]
    out = reconcile_bass(segs, [("G", 0.8)])
    assert out[0].bass == "G" and out[0].label == "C/G"

def test_confident_non_chord_tone_bass_is_gated():
    segs = [_seg(root="C", quality="maj")]
    out = reconcile_bass(segs, [("F#", 0.9)])   # confident but not a C-major tone
    assert out[0].bass == "C" and out[0].label == "C"

def test_low_confidence_crepe_bass_is_gated():
    segs = [_seg(root="C", quality="maj")]
    out = reconcile_bass(segs, [("G", 0.3)])
    assert out[0].bass == "C" and out[0].label == "C"

def test_crema_slash_preserved_when_crepe_has_nothing():
    segs = [_seg(root="C", quality="maj", bass="E")]   # crema's own C/E
    out = reconcile_bass(segs, [("E", None)])          # None = fallback, not CREPE
    assert out[0].bass == "E" and out[0].label == "C/E"
```

- [ ] **Step 2: RED** — run the focused test file; the new tests fail (missing `QUALITY_TONES`, tuple signature).

- [ ] **Step 3: Implement.**

```python
# engine/notes.py — append
QUALITY_TONES: dict[str, tuple[int, ...]] = {
    "maj": (0, 4, 7), "min": (0, 3, 7), "dom7": (0, 4, 7, 10),
    "maj7": (0, 4, 7, 11), "min7": (0, 3, 7, 10), "dim": (0, 3, 6),
    "aug": (0, 4, 8), "sus2": (0, 2, 7), "sus4": (0, 5, 7),
    "6": (0, 4, 7, 9), "min6": (0, 3, 7, 9), "hdim7": (0, 3, 6, 10),
    "dim7": (0, 3, 6, 9), "minmaj7": (0, 3, 7, 11),
    "9": (0, 2, 4, 7, 10), "maj9": (0, 2, 4, 7, 11), "min9": (0, 2, 3, 7, 10),
    "N": (),
}

def chord_tone_classes(root: str, quality: str) -> set[str]:
    if root == "N" or quality == "N":
        return set()
    root_idx = NOTES.index(normalize_note(root))
    return {NOTES[(root_idx + iv) % 12] for iv in QUALITY_TONES.get(quality, (0, 4, 7))}
```

```python
# engine/bass.py — detect_bass_notes returns (pc, conf) tuples
def detect_bass_notes(bass_wav: str, segments: list[ChordSegment]) -> list[tuple[str, float | None]]:
    """Per-segment bass pitch class from the isolated bass stem via CREPE.

    Returns (pitch_class, median_confidence); confidence None means CREPE had no
    confident frames and the value is the segment's existing (crema) bass.
    """
    import crepe
    import librosa

    y, sr = librosa.load(bass_wav, sr=16000, mono=True)
    times, freqs, conf, _ = crepe.predict(y, sr, viterbi=True, step_size=50)

    result: list[tuple[str, float | None]] = []
    for seg in segments:
        mask = (times >= seg.start) & (times < seg.end) & (conf > 0.5)
        if not mask.any():
            result.append((seg.bass, None))
            continue
        pc = _hz_to_pitch_class(float(np.median(freqs[mask])))
        if pc is None:
            result.append((seg.bass, None))
        else:
            result.append((pc, float(np.median(conf[mask]))))
    return result
```

```python
# engine/postprocess.py — replace reconcile_bass
BASS_CONF_MIN = 0.5

def reconcile_bass(segs: list[ChordSegment], bass_reads: list[tuple[str, float | None]]) -> list[ChordSegment]:
    """Attach CREPE bass as a slash ONLY when confident AND a chord tone (spec 2026-07-11).

    conf None means the read is the segment's own (crema) bass — kept untouched, so
    crema's slash chords survive low-confidence CREPE (invariant from cd9772f).
    """
    from engine.notes import chord_tone_classes
    out = []
    for s, (pc, conf) in zip(segs, bass_reads):
        if conf is None:
            out.append(s.model_copy())
            continue
        b = normalize_note(pc)
        if conf >= BASS_CONF_MIN and b in chord_tone_classes(s.root, s.quality):
            new_bass = b
        else:
            new_bass = s.bass  # failed gate is a NO-OP: crema's own bass survives (spec:
                               # "gating never rewrites crema's"; amended during Task 0)
        out.append(s.model_copy(update={
            "bass": new_bass,
            "label": format_label(s.root, s.quality, new_bass),
        }))
    return out
```

`engine/pipeline.py` needs no call-site change (`reconcile_bass(segs, detect_bass_notes(...))` still lines up). Check any OTHER callers/tests of `detect_bass_notes`'s old `list[str]` shape and update them.

- [ ] **Step 4: GREEN** — focused file passes; then full `pytest -q` (existing bass/reconcile tests may need signature updates — update mechanically, preserving what they asserted; the cd9772f invariant test must still pass).

- [ ] **Step 5: Commit** — `git add engine tests && git commit -m "feat(engine): gate slash chords to confident chord-tone bass reads"`.

---

### Task 1: Quality simplification + short-segment merge + version bump

**Files:**
- Modify: `engine/postprocess.py`, `engine/pipeline.py`, `engine/__init__.py`
- Test: same postprocess test file

**Interfaces:**
- Produces:
  - `simplify_quality(segs: list[ChordSegment]) -> list[ChordSegment]`
  - `merge_short(segs: list[ChordSegment], beats: list[float]) -> list[ChordSegment]`
  - `engine.__version__ == "0.2.0"`
- Pipeline order (final): `raw_to_segments → snap_to_beats → merge_adjacent → reconcile_bass → apply_key_prior → simplify_quality → merge_short → merge_adjacent` (simplify runs AFTER the key prior so out-of-key exotics — already confidence-docked ×0.7 — simplify more readily; the trailing `merge_adjacent` collapses neighbors that became identical).

- [ ] **Step 1: Failing tests.**

```python
def test_low_confidence_exotic_simplifies_high_survives():
    lo = _seg(root="A#", quality="dim7", conf=0.4)
    hi = _seg(root="A#", quality="dim7", conf=0.9, start=2.0, end=4.0)
    out = simplify_quality([lo, hi])
    assert (out[0].quality, out[0].label) == ("min", "A#m")
    assert out[1].quality == "dim7"

def test_trusted_quality_never_simplifies():
    out = simplify_quality([_seg(root="D", quality="maj7", conf=0.1)])
    assert out[0].quality == "maj7"

def test_simplify_recomputes_label_and_keeps_valid_bass():
    seg = _seg(root="A", quality="sus4", bass="E", conf=0.4)  # E is a sus4 tone AND a maj tone
    out = simplify_quality([seg])
    assert (out[0].quality, out[0].label) == ("maj", "A/E")

def test_simplify_drops_bass_that_left_the_chord():
    seg = _seg(root="A", quality="sus2", bass="B", conf=0.4)  # B is a sus2 tone, not a maj tone
    out = simplify_quality([seg])
    assert (out[0].quality, out[0].bass, out[0].label) == ("maj", "A", "A")

def test_merge_short_absorbs_by_shared_tones():
    beats = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
    segs = [_seg(root="C", quality="maj", start=0.0, end=3.0),
            _seg(root="E", quality="min", start=3.0, end=4.0),   # 1 beat: short
            _seg(root="F", quality="maj", start=4.0, end=6.0)]
    out = merge_short(segs, beats)
    # Em shares {E,G} with C-maj but only {} with F-maj -> absorbed backward into C
    assert len(out) == 2 and out[0].end == 4.0 and out[0].root == "C"

def test_merge_short_never_touches_N():
    beats = [0.0, 1.0, 2.0, 3.0, 4.0]
    segs = [_seg(root="N", quality="N", start=0.0, end=1.0),
            _seg(root="C", quality="maj", start=1.0, end=4.0)]
    out = merge_short(segs, beats)
    assert out[0].quality == "N" and len(out) == 2
```

- [ ] **Step 2: RED.**

- [ ] **Step 3: Implement.**

```python
# engine/postprocess.py — append
SIMPLIFY_CONF_MAX = 0.6
TRUSTED_QUALITIES = {"maj", "min", "dom7", "maj7", "min7", "N"}
SIMPLIFY_MAP = {
    "dim": "min", "dim7": "min", "hdim7": "min", "min6": "min",
    "min9": "min", "minmaj7": "min",
    "aug": "maj", "sus2": "maj", "sus4": "maj", "6": "maj", "9": "maj", "maj9": "maj",
}

def simplify_quality(segs: list[ChordSegment]) -> list[ChordSegment]:
    """Low-confidence exotic qualities collapse to the nearest plain triad (spec 2026-07-11)."""
    from engine.notes import chord_tone_classes
    out = []
    for s in segs:
        if s.quality in TRUSTED_QUALITIES or s.confidence >= SIMPLIFY_CONF_MAX:
            out.append(s.model_copy())
            continue
        q = SIMPLIFY_MAP.get(s.quality, "maj")
        bass = s.bass if s.bass in chord_tone_classes(s.root, q) else s.root
        out.append(s.model_copy(update={
            "quality": q, "bass": bass, "label": format_label(s.root, q, bass),
        }))
    return out


def _local_beat_interval(beats: list[float], t: float) -> float:
    if len(beats) < 2:
        return 0.5
    import bisect
    i = min(max(bisect.bisect_left(beats, t), 1), len(beats) - 1)
    return beats[i] - beats[i - 1]

def merge_short(segs: list[ChordSegment], beats: list[float]) -> list[ChordSegment]:
    """Absorb non-N segments shorter than 2 local beats into the more tone-similar
    non-N neighbor (tie -> earlier). N segments are never created, absorbed or crossed."""
    from engine.notes import chord_tone_classes
    out = [s.model_copy() for s in segs]
    changed = True
    while changed:
        changed = False
        for i, s in enumerate(out):
            if s.quality == "N":
                continue
            if s.end - s.start >= 2 * _local_beat_interval(beats, s.start):
                continue
            prev = out[i - 1] if i > 0 and out[i - 1].quality != "N" else None
            nxt = out[i + 1] if i < len(out) - 1 and out[i + 1].quality != "N" else None
            if prev is None and nxt is None:
                continue
            tones = chord_tone_classes(s.root, s.quality)
            p_score = len(tones & chord_tone_classes(prev.root, prev.quality)) if prev else -1
            n_score = len(tones & chord_tone_classes(nxt.root, nxt.quality)) if nxt else -1
            if p_score >= n_score:
                out[i - 1] = prev.model_copy(update={"end": s.end})
            else:
                out[i + 1] = nxt.model_copy(update={"start": s.start})
            del out[i]
            changed = True
            break
    return out
```

Pipeline: reorder to the sequence in Interfaces (move `apply_key_prior` before the new `simplify_quality`, then `merge_short(segs, beats)`, then a second `merge_adjacent(segs)`). Bump `engine/__init__.py` `__version__ = "0.2.0"`.

- [ ] **Step 4: GREEN** + full `pytest -q` (a pipeline-order test or version literal may need updating — keep assertions equivalent).

- [ ] **Step 5: Commit** — `git add engine tests && git commit -m "feat(engine): simplify low-confidence exotics and merge flicker segments; engine 0.2.0"`.

---

### Task 2: Meter detection + chart schema fields

**Files:**
- Create: `engine/meter.py`; Test: new `tests/...test_meter.py` (mirror layout)
- Modify: `engine/schema.py`, `engine/pipeline.py`, `web/src/lib/types.ts`

**Interfaces:**
- Produces:
  - `engine/meter.py`: `detect_meter(beats: list[float], change_times: list[float]) -> tuple[Meter, list[float]]` returning the `Meter` model and `downbeats`.
  - `engine/schema.py`: `class Meter(BaseModel): beatsPerBar: int; confidence: float`; `Chart` gains `meter: Meter | None = None` and `downbeats: list[float] = Field(default_factory=list)`.
  - `web/src/lib/types.ts`: `meter?: { beatsPerBar: number; confidence: number }; downbeats?: number[];` on `Chart`.

- [ ] **Step 1: Failing tests.**

```python
import random
from engine.meter import detect_meter

def _grid(n, interval=0.5, start=0.0):
    return [start + i * interval for i in range(n)]

def test_recovers_4_4_with_jitter():
    beats = _grid(64)
    rng = random.Random(7)
    changes = [beats[i] + rng.uniform(-0.05, 0.05) for i in range(0, 64, 8)]  # every 2 bars of 4
    meter, downbeats = detect_meter(beats, changes)
    assert meter.beatsPerBar == 4
    assert meter.confidence > 0
    assert downbeats[0] == beats[0] and downbeats[1] == beats[4]

def test_recovers_3_4_with_phase():
    beats = _grid(60)
    changes = [beats[i] for i in range(2, 60, 3)]   # bars of 3, phase 2
    meter, downbeats = detect_meter(beats, changes)
    assert meter.beatsPerBar == 3
    assert downbeats[0] == beats[2]

def test_degenerate_input_reports_unknown():
    meter, downbeats = detect_meter(_grid(5), [0.0])
    assert (meter.beatsPerBar, meter.confidence) == (4, 0.0)
    assert downbeats == []
```

- [ ] **Step 2: RED.**

- [ ] **Step 3: Implement.**

```python
# engine/meter.py
"""Meter (beats-per-bar) detection from the prior that chord changes land on downbeats."""
from engine.schema import Meter

TOLERANCE = 0.12  # s

def _aligned_fraction(beats, changes, k, phase):
    marks = beats[phase::k]
    if not marks:
        return 0.0
    hits = 0
    for c in changes:
        # nearest mark within tolerance
        lo, hi = 0, len(marks) - 1
        while lo < hi:
            mid = (lo + hi) // 2
            if marks[mid] < c:
                lo = mid + 1
            else:
                hi = mid
        best = min(
            (abs(marks[j] - c) for j in (lo - 1, lo, lo + 1) if 0 <= j < len(marks)),
            default=1e9,
        )
        if best <= TOLERANCE:
            hits += 1
    return hits / len(changes)

def detect_meter(beats: list[float], change_times: list[float]) -> tuple[Meter, list[float]]:
    if len(beats) < 8 or len(change_times) < 4:
        return Meter(beatsPerBar=4, confidence=0.0), []
    scored = sorted(
        ((_aligned_fraction(beats, change_times, k, p) - 1.0 / k, k, p)
         for k in (2, 3, 4) for p in range(k)),
        reverse=True,
    )
    best, second = scored[0], scored[1]
    _, k, p = best
    confidence = max(0.0, min(1.0, best[0] - second[0] + 0.0))
    # margin alone can be tiny when two phases of the same k tie; fold in the raw score
    confidence = max(confidence, 0.0)
    return Meter(beatsPerBar=k, confidence=round(best[0] - second[0], 4) if best[0] > 0 else 0.0), list(beats[p::k])
```

NOTE to implementer: the confidence lines above are the spec's intent (margin between best and second-best, clamped [0,1], and 0 when the best score isn't positive) — implement that cleanly in ONE expression rather than transcribing the redundant lines verbatim; the tests only require `> 0` for clear grids and `== 0.0` for degenerate input.

Schema: add `Meter` model + the two `Chart` fields; pipeline computes `change_times = [s.start for s in segs[1:]]` (first segment's start is not a "change") after post-processing and passes `meter=..., downbeats=...` to `Chart(...)`. TS: add the optional fields to `web/src/lib/types.ts`.

- [ ] **Step 4: GREEN**; full `pytest -q`; `cd web && npx tsc -b --noEmit && npm test`; `cd extension && npm run typecheck` (optional fields must not break either).

- [ ] **Step 5: Commit** — `git add engine tests web/src/lib/types.ts && git commit -m "feat(engine): meter detection with downbeats in the chart schema"`.

---

### Task 3: Ribbon downbeat bar lines + panel width/thinness

**Files:**
- Modify: `extension/src/overlay/Ribbon.tsx`, `extension/src/overlay/Panel.tsx`, `extension/src/overlay/styles.ts`
- Test: extend `extension/src/overlay/Ribbon.test.tsx`

**Interfaces:**
- `RibbonProps` gains `downbeats?: number[]`. Bar-start rule: if `downbeats` non-empty, a cell `b` is a bar start iff `beats[b]` is in the downbeat set (exact float membership — downbeats are copied from the same `beats` array by the engine); else fall back to `b % 4 === 0`. Panel passes `chart.downbeats`.

- [ ] **Step 1: Failing tests** (extend Ribbon.test.tsx; existing tests keep the fallback covered):

```tsx
test('bar lines follow downbeats when provided (3/4)', () => {
  const c = render(
    <Ribbon beats={beats} chords={chords} currentBeat={0} currentChordIndex={0}
            downbeats={[0, 3, 6, 9, 12, 15]} />,
  ).container;
  const cells = c.querySelectorAll('.tabit-beat');
  expect(cells[0].className).toContain('tabit-beat-bar');
  expect(cells[3].className).toContain('tabit-beat-bar');
  expect(cells[4].className).not.toContain('tabit-beat-bar');
});

test('empty downbeats falls back to every 4th beat', () => {
  const c = render(
    <Ribbon beats={beats} chords={chords} currentBeat={0} currentChordIndex={0} downbeats={[]} />,
  ).container;
  expect(c.querySelectorAll('.tabit-beat')[4].className).toContain('tabit-beat-bar');
});
```

- [ ] **Step 2: RED.**

- [ ] **Step 3: Implement.** In Ribbon: `const downbeatSet = useMemo(() => new Set(downbeats ?? []), [downbeats]);` and the bar-start class becomes `downbeatSet.size > 0 ? downbeatSet.has(beats[b]) : b % 4 === 0`. Panel passes `downbeats={chart.downbeats}`.

- [ ] **Step 4: Layout (styles.ts).** Exact changes: `.tabit-panel` padding `10px 5vw 12px` → `10px 0 12px`; `.tabit-beat` height 64px → 48px; `.tabit-beat-chord` font-size 21px → 19px, top 10px → 6px; `.tabit-beat-pips` bottom 6px → 4px; `.tabit-ribbon` height 86px → 64px (keep padding-top 12px); `.tabit-ribbon-track` height 64px → 48px; `.tabit-panel-header-compact` padding 8px 14px → 6px 14px; `.tabit-view-toggle` padding `2px 0 8px` → `2px 0 6px`.

- [ ] **Step 5: GREEN** — Ribbon file, then `npm test && npm run typecheck && npm run build`.

- [ ] **Step 6: Commit** — `git add extension && git commit -m "feat(ext): downbeat bar lines, full-width thinner panel"`.

---

### Task 4: Live verification + docs (controller-driven)

- [ ] **Step 1: Full sweep** — root `pytest -q`; web tests + tsc; extension tests + typecheck + build.
- [ ] **Step 2: Live re-analysis** — API running; engine 0.2.0 busts the cache, so `GET /chart/TAWAL3LDzQ4` → fresh ~2.5 min analysis. Verify: chart JSON has `meter`/`downbeats`, no spurious non-chord-tone slashes, no sub-2-beat segments. Headful Chromium: bar lines match the song's real meter (not stuck on 4), panel spans the video width, panel height ≈ 120–130px, still no page scroll at 1440×900. User eyeballs the chart against what they play.
- [ ] **Step 3: Docs** — README "Honest about accuracy" section gains one sentence on the conservatism pass; `docs/PROGRESS.md` gains the feature line. Commit.

---

## Self-Review

**Spec coverage:** slash gating incl. crema invariant (T0); simplification map + trusted set, short-merge with N rules, pipeline order, version bump (T1); meter heuristic k/phase/confidence/degenerate + additive schema both languages (T2); ribbon downbeats + fallback + width/thinner numbers (T3); live re-analysis + user eyeball + docs (T4). ✅

**Placeholder scan:** meter confidence block carries an explicit NOTE telling the implementer the intent to implement cleanly — deliberate, not a placeholder; all other steps carry complete code. Test-file paths deliberately say "mirror the existing layout" because the plan author verified `tests/` exists but not its internal naming — the implementer must look first (stated in Global Constraints). ✅

**Type consistency:** `detect_bass_notes` tuple shape matches `reconcile_bass(bass_reads)` (T0, unchanged call site); `chord_tone_classes` used by T0 gate, T1 simplify + merge scoring; `Meter` model name matches schema and meter.py; TS optional fields match Python emissions; `RibbonProps.downbeats` matches Panel's `chart.downbeats`. Thresholds appear once each as named constants. ✅
