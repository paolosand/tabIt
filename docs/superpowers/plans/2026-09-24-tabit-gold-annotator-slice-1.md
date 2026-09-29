# tabIt Gold-Set Annotator — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the dev-only annotation screen that loads the engine's chart as ghost chips, lets the user confirm/correct chords by ear in scale degrees, autosaves to `benchmarks/gold/annotations/`, and exports `.lab` files the existing scorer reads.

**Architecture:** A `#annotate` screen in the existing `web/` app (DEV-guarded, lazy-loaded so it is absent from production builds). All editing logic is pure TypeScript in `web/src/lib/gold/` (degrees, grid, span operations, `.lab` export, validation) and is unit-tested; a reducer + keymap in `web/src/annotate/` drive a lead-sheet UI; a dev-only Vite middleware in `web/tools/` persists JSON + `.lab` files to disk.

**Tech Stack:** React 19, TypeScript ~6.0 (`erasableSyntaxOnly`, `verbatimModuleSyntax`), Vite 8 + Vitest 4 (jsdom + Testing Library), Node `fs`/`http` for the middleware, pytest for one contract test. **No new npm dependencies.**

**Spec:** `docs/superpowers/specs/2026-09-24-tabit-gold-annotator-design.md` (read it first; this plan implements its **Slice 1**).

## Global Constraints

- **Dev-only.** The screen is reachable only under `npm run dev` at `#annotate`, guarded by `import.meta.env.DEV`; `web/dist` must contain no `__gold` reference. Not linked from Landing; not in the extension.
- **No changes under `api/` or `engine/`.** The product API gets no new endpoints.
- **Vocabulary:** root + {`maj`, `min`, `dom7`, `min7`, `maj7`} + `N` (no chord) + `X` (unsure). No dim/aug entry keys.
- **Times are seconds**, never beat indices. Spans are sorted, non-overlapping, `0 ≤ start < end ≤ duration`. `X` spans have `root: null` and `flag: "skip"`.
- **Absolute chords are the source of truth**; degrees are display/entry only. A key change on a labeled song asks: keep the chords (default) or transpose them.
- **Storage:** `benchmarks/gold/annotations/<videoId>.json` + `<videoId>.lab` + `<videoId>.sure.lab`, committed, no audio. Video ID must match `^[A-Za-z0-9_-]{11}$`. PUT body cap 2 MB. Autosave debounce 500 ms. Undo depth 200. Grid "loose" warning at beat-spacing CV > 0.08.
- **Extension rule:** a chord lasts until the next chord. Empty-region default = end of bar; a preceding span auto-extends across a gap of **at most 4 bars** (`MAX_AUTO_EXTEND_BARS = 4`).
- **Digit defaults:** `1`–`7` give the diatonic triad; the two diminished degrees (vii° in major, ii° in minor) fall back to the **minor** triad; a `b`-flatted degree defaults to **major**.
- **Slice 1 only.** Out of scope (Slice 2, its own plan after the first hands-on session): `R` repeat, chord nudge `[` `]`, `s` sure toggle, ½×/2× grid + global nudge controls, loop-bar, click track, blind toggle, tap-along, off-grid stamp. The `blind`, `grid.factor` and `grid.nudgeSec` fields exist in the schema now (defaults `false`, `1`, `0`).
- **Project conventions:** run web commands from `web/` with Node 20 (`source ~/.nvm/nvm.sh && nvm use 20`). Use `import type` for type-only imports. Relative imports inside `web/src/lib/gold/` and `web/tools/` use explicit `.ts` extensions (the node tsconfig compiles them under `nodenext`). Commit trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

## Review Focus

Failure modes the spec implies but that no happy-path test would hit; each has a test in the named task.

1. **A song with no/too few beats** (analysis failure): the editor must say so and offer Back, not crash; `buildRows(0, …)` returns `[]`. *(Task 2, Task 8)*
2. **A chart with no `videoId`** (an uploaded file, not a YouTube URL): refuse with a clear message rather than writing `undefined.json`. *(Task 7, Task 8)*
3. **The dev server restarts mid-session / a save fails:** the status shows "Save failed", the draft stays in `localStorage`, and the next change re-sends it; on reload a newer draft wins. *(Task 7, Task 8)*
4. **Keys typed into a control** (a `<select>`) or **held down** (auto-repeat) must not place chords or duplicate actions. *(Task 7, Task 8)*
5. **Placing at/after the end of the song, or an oversized save:** a chord at `t ≥ duration` is a no-op; a body over 2 MB gets a 413, not a silent drop. *(Task 3, Task 5)*

## File Structure

| File | Responsibility |
|------|----------------|
| `web/src/lib/gold/types.ts` | `GoldFile`, `GoldSpan`, `ChordChoice`, `VIDEO_ID_RE`, … |
| `web/src/lib/gold/degrees.ts` | pitch-class helpers, key palette, digit→chord, quality toggles, Harte label, chord name, Roman numeral, engine-quality reduction |
| `web/src/lib/gold/grid.ts` | effective beats, grid-quality badge, bar/row layout, beat lookup |
| `web/src/lib/gold/spans.ts` | ghost computation and all span edits (place/split/replace/confirm/clear/retone/transpose) |
| `web/src/lib/gold/lab.ts` | `GoldFile` → `.lab` text (two tiers), `labeledSeconds` |
| `web/src/lib/gold/validate.ts` | `validateGold` (used by the middleware) |
| `web/src/lib/gold/file.ts` | `newGoldFromChart` |
| `web/src/lib/gold/sample.ts` | `sampleGold()` test factory |
| `web/tools/gold-plugin.ts` | `createGoldStore`, `goldHandler`, `goldPlugin` (dev-only Vite middleware) |
| `web/src/playback/YouTubePlayer.tsx` | extended: `PlayerControls`, `width`, `onError` |
| `web/src/annotate/goldApi.ts` | client for `/__gold` + localStorage drafts |
| `web/src/annotate/annotatorReducer.ts` | state, actions, undo/redo |
| `web/src/annotate/keymap.ts` | key event → action |
| `web/src/annotate/layout.ts` | segments, row clipping, click→column, time format |
| `web/src/annotate/useAnnotator.ts` | reducer + debounced autosave |
| `web/src/annotate/{AnnotateSheet,TopBar,AnnotateEditor,Annotate}.tsx` | UI |
| `web/scripts/check-dev-only.mjs` | asserts `dist/` has no annotator code |
| `tests/test_gold_contract.py`, `tests/fixtures/gold_sample.lab` | tool ↔ scorer contract |
| `benchmarks/gold/README.md` | how to use the tool |

---

### Task 0: Branch and commit the design docs

**Files:**
- Create: branch `feat/gold-annotator`

- [ ] **Step 1: Create the branch and commit the spec and this plan**

```bash
cd /Users/paolosandejas/Documents/PortfolioProjects/tabIt
git branch --show-current            # expect: main
git switch -c feat/gold-annotator
git add docs/superpowers/specs/2026-09-24-tabit-gold-annotator-design.md \
        docs/superpowers/plans/2026-09-24-tabit-gold-annotator-slice-1.md
git commit -m "docs: gold-set annotator design + slice 1 plan" \
           -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

Do **not** `git add -A`: the untracked demo `.mp4` at the repo root must stay out.

---

### Task 1: Types and degree math

**Files:**
- Create: `web/src/lib/gold/types.ts`, `web/src/lib/gold/degrees.ts`, `web/src/lib/gold/sample.ts`
- Test: `web/src/lib/gold/degrees.test.ts`

**Interfaces:**
- Produces (used by every later task):
  - `types.ts`: `GoldQuality`, `SpanQuality`, `Flag`, `Provenance`, `Mode`, `ChordChoice {root: string|null; quality: SpanQuality}`, `GoldKey`, `GoldGrid`, `EngineChord`, `GoldSpan`, `GoldFile`, `GoldSummary`, `VIDEO_ID_RE`.
  - `degrees.ts`: `PITCH_NAMES`, `pcOf(name): number`, `nameOf(pc): string`, `chordForDigit(key, digit, flat): ChordChoice`, `paletteFor(key): PaletteEntry[]`, `QualityToggle = 'm'|'d'|'j'`, `toggleQuality(c, which): ChordChoice`, `harteLabel(c): string`, `chordName(c): string`, `numeralFor(key, c): string`, `reduceEngineChord(root, quality): ChordChoice`.
  - `sample.ts`: `sampleGold(over?: Partial<GoldFile>): GoldFile` (12 s song, 24 beats at 0.5 s, C major, 3 engine chords Am/F/C over 0–4/4–8/8–12, no spans).

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/gold/degrees.test.ts`:

```ts
import { expect, test } from 'vitest';
import {
  chordForDigit, chordName, harteLabel, nameOf, numeralFor, paletteFor, pcOf,
  reduceEngineChord, toggleQuality,
} from './degrees.ts';
import type { GoldKey } from './types.ts';

const C: GoldKey = { tonic: 'C', mode: 'major', source: 'engine' };
const Am: GoldKey = { tonic: 'A', mode: 'minor', source: 'engine' };

test('pcOf/nameOf round-trip, accept flats, reject junk', () => {
  expect(pcOf('C')).toBe(0);
  expect(pcOf('A#')).toBe(10);
  expect(pcOf('Bb')).toBe(10);
  expect(nameOf(13)).toBe('C#');
  expect(nameOf(-1)).toBe('B');
  expect(() => pcOf('H')).toThrow();
});

test('major key: digits give diatonic triads; 7 falls back to minor (dim is outside the vocabulary)', () => {
  expect(chordForDigit(C, 1, false)).toEqual({ root: 'C', quality: 'maj' });
  expect(chordForDigit(C, 6, false)).toEqual({ root: 'A', quality: 'min' });
  expect(chordForDigit(C, 4, false)).toEqual({ root: 'F', quality: 'maj' });
  expect(chordForDigit(C, 7, false)).toEqual({ root: 'B', quality: 'min' });
  expect(() => chordForDigit(C, 8, false)).toThrow();
});

test('flat prefix lowers the degree a semitone and defaults to major', () => {
  expect(chordForDigit(C, 7, true)).toEqual({ root: 'A#', quality: 'maj' });
  expect(chordForDigit(C, 3, true)).toEqual({ root: 'D#', quality: 'maj' });
});

test('palettes: names and numerals, major and natural-minor', () => {
  expect(paletteFor(C).map((p) => p.name)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bm']);
  expect(paletteFor(C).map((p) => p.numeral)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii']);
  expect(paletteFor(Am).map((p) => p.name)).toEqual(['Am', 'Bm', 'C', 'Dm', 'Em', 'F', 'G']);
  expect(paletteFor(Am).map((p) => p.numeral)).toEqual(['i', 'ii', 'bIII', 'iv', 'v', 'bVI', 'bVII']);
});

test('toggleQuality: m flips major/minor keeping the 7th; d adds/removes b7; j toggles maj7', () => {
  const maj = { root: 'G', quality: 'maj' } as const;
  const min = { root: 'A', quality: 'min' } as const;
  expect(toggleQuality(maj, 'm').quality).toBe('min');
  expect(toggleQuality({ root: 'G', quality: 'dom7' }, 'm').quality).toBe('min7');
  expect(toggleQuality({ root: 'A', quality: 'min7' }, 'm').quality).toBe('dom7');
  expect(toggleQuality({ root: 'C', quality: 'maj7' }, 'm').quality).toBe('min7');
  expect(toggleQuality(maj, 'd').quality).toBe('dom7');
  expect(toggleQuality(min, 'd').quality).toBe('min7');
  expect(toggleQuality({ root: 'G', quality: 'dom7' }, 'd').quality).toBe('maj');
  expect(toggleQuality({ root: 'A', quality: 'min7' }, 'd').quality).toBe('min');
  expect(toggleQuality({ root: 'C', quality: 'maj7' }, 'd').quality).toBe('dom7');
  expect(toggleQuality({ root: 'C', quality: 'maj' }, 'j').quality).toBe('maj7');
  expect(toggleQuality({ root: 'C', quality: 'maj7' }, 'j').quality).toBe('maj');
  expect(toggleQuality({ root: 'G', quality: 'dom7' }, 'j').quality).toBe('maj7');
  // j on a minor chord has no vocabulary equivalent: unchanged
  expect(toggleQuality(min, 'j')).toBe(min);
  // N and X never change
  const n = { root: 'N', quality: 'N' } as const;
  expect(toggleQuality(n, 'm')).toBe(n);
});

test('harteLabel and chordName', () => {
  expect(harteLabel({ root: 'A', quality: 'min7' })).toBe('A:min7');
  expect(harteLabel({ root: 'G', quality: 'dom7' })).toBe('G:7');
  expect(harteLabel({ root: 'C', quality: 'maj7' })).toBe('C:maj7');
  expect(harteLabel({ root: 'N', quality: 'N' })).toBe('N');
  expect(harteLabel({ root: null, quality: 'X' })).toBe('X');
  expect(chordName({ root: 'A', quality: 'min7' })).toBe('Am7');
  expect(chordName({ root: 'F', quality: 'maj' })).toBe('F');
  expect(chordName({ root: 'N', quality: 'N' })).toBe('—');
  expect(chordName({ root: null, quality: 'X' })).toBe('?');
});

test('numeralFor: case follows quality, flats stay lowercase b, 7ths suffixed', () => {
  expect(numeralFor(C, { root: 'A', quality: 'min' })).toBe('vi');
  expect(numeralFor(C, { root: 'G', quality: 'dom7' })).toBe('V7');
  expect(numeralFor(C, { root: 'C', quality: 'maj7' })).toBe('Imaj7');
  expect(numeralFor(C, { root: 'A', quality: 'min7' })).toBe('vi7');
  expect(numeralFor(C, { root: 'A#', quality: 'maj' })).toBe('bVII');
  expect(numeralFor(C, { root: 'A#', quality: 'min' })).toBe('bvii');
  expect(numeralFor(C, { root: 'N', quality: 'N' })).toBe('—');
  expect(numeralFor(C, { root: null, quality: 'X' })).toBe('?');
});

test('reduceEngineChord folds out-of-vocabulary engine qualities to a triad', () => {
  expect(reduceEngineChord('A', 'min7')).toEqual({ root: 'A', quality: 'min7' });
  expect(reduceEngineChord('B', 'dim')).toEqual({ root: 'B', quality: 'min' });
  expect(reduceEngineChord('B', 'hdim7')).toEqual({ root: 'B', quality: 'min' });
  expect(reduceEngineChord('G', 'sus4')).toEqual({ root: 'G', quality: 'maj' });
  expect(reduceEngineChord('C', 'aug')).toEqual({ root: 'C', quality: 'maj' });
  expect(reduceEngineChord('D', '9')).toEqual({ root: 'D', quality: 'maj' });
  expect(reduceEngineChord('D', 'weird')).toEqual({ root: 'D', quality: 'maj' });
  expect(reduceEngineChord('N', 'N')).toEqual({ root: 'N', quality: 'N' });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/gold/degrees.test.ts`
Expected: FAIL — cannot resolve `./degrees.ts`.

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/gold/types.ts`:

```ts
export type GoldQuality = 'maj' | 'min' | 'dom7' | 'min7' | 'maj7';
export type SpanQuality = GoldQuality | 'N' | 'X';
export type Flag = 'sure' | 'guess' | 'skip';
export type Provenance = 'confirmed' | 'edited' | 'manual';
export type Mode = 'major' | 'minor';

/** A placeable chord. root is a sharp-spelled pitch class, 'N' for no chord, null for X (unsure). */
export interface ChordChoice {
  root: string | null;
  quality: SpanQuality;
}

export interface GoldKey {
  tonic: string;
  mode: Mode;
  source: 'engine' | 'user';
}

export interface GoldGrid {
  factor: 0.5 | 1 | 2;
  nudgeSec: number;
  beatsPerBar: number;
  downbeatBeat: number;
}

export interface EngineChord {
  start: number;
  end: number;
  root: string;
  quality: string;
  label: string;
  confidence: number;
}

export interface GoldSpan {
  start: number;
  end: number;
  root: string | null;
  quality: SpanQuality;
  /** Harte label: 'A:min7' | 'N' | 'X'. Derived from root+quality; the .lab export reads this. */
  label: string;
  flag: Flag;
  source: Provenance;
}

export interface GoldFile {
  schemaVersion: 1;
  videoId: string;
  title: string;
  url: string;
  duration: number;
  key: GoldKey;
  grid: GoldGrid;
  /** Engine beat snapshot (raw, seconds). */
  beats: number[];
  engine: { version: string; chords: EngineChord[] };
  blind: boolean;
  spans: GoldSpan[];
  updatedAt: string;
}

export interface GoldSummary {
  videoId: string;
  title: string;
  updatedAt: string;
  labeledSeconds: number;
}

export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
```

Create `web/src/lib/gold/degrees.ts`:

```ts
import type { ChordChoice, GoldKey, GoldQuality, Mode } from './types.ts';

export const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

const FLAT_TO_SHARP: Record<string, string> = {
  Cb: 'B', Db: 'C#', Eb: 'D#', Fb: 'E', Gb: 'F#', Ab: 'G#', Bb: 'A#',
};

export function pcOf(name: string): number {
  const n = FLAT_TO_SHARP[name] ?? name;
  const i = (PITCH_NAMES as readonly string[]).indexOf(n);
  if (i < 0) throw new Error(`Unknown note name: ${name}`);
  return i;
}

export function nameOf(pc: number): string {
  return PITCH_NAMES[((pc % 12) + 12) % 12];
}

const INTERVALS: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

// Default quality per digit. The two diminished degrees (vii° in major, ii° in
// minor) fall back to the minor triad because dim is outside the v1 vocabulary.
const TRIADS: Record<Mode, GoldQuality[]> = {
  major: ['maj', 'min', 'min', 'maj', 'maj', 'min', 'min'],
  minor: ['min', 'min', 'maj', 'min', 'min', 'maj', 'maj'],
};

export function chordForDigit(key: GoldKey, digit: number, flat: boolean): ChordChoice {
  if (!Number.isInteger(digit) || digit < 1 || digit > 7) {
    throw new Error(`Degree out of range: ${digit}`);
  }
  const interval = INTERVALS[key.mode][digit - 1] - (flat ? 1 : 0);
  return {
    root: nameOf(pcOf(key.tonic) + interval),
    // flatted degrees (bVII, bVI, bIII) are almost always major in pop
    quality: flat ? 'maj' : TRIADS[key.mode][digit - 1],
  };
}

const HARTE: Record<GoldQuality, string> = { maj: 'maj', min: 'min', dom7: '7', min7: 'min7', maj7: 'maj7' };
const SUFFIX: Record<GoldQuality, string> = { maj: '', min: 'm', dom7: '7', min7: 'm7', maj7: 'maj7' };

export function harteLabel(c: ChordChoice): string {
  if (c.quality === 'X') return 'X';
  if (c.quality === 'N') return 'N';
  return `${c.root}:${HARTE[c.quality]}`;
}

export function chordName(c: ChordChoice): string {
  if (c.quality === 'X') return '?';
  if (c.quality === 'N') return '—';
  return `${c.root}${SUFFIX[c.quality]}`;
}

const NUMERALS = ['I', 'bII', 'II', 'bIII', 'III', 'IV', 'bV', 'V', 'bVI', 'VI', 'bVII', 'VII'];

export function numeralFor(key: GoldKey, c: ChordChoice): string {
  if (c.quality === 'X') return '?';
  if (c.quality === 'N' || c.root === null) return '—';
  const base = NUMERALS[(pcOf(c.root) - pcOf(key.tonic) + 12) % 12];
  const minor = c.quality === 'min' || c.quality === 'min7';
  const cased = minor ? base.replace(/[IV]+$/, (m) => m.toLowerCase()) : base;
  const suffix = c.quality === 'dom7' || c.quality === 'min7' ? '7' : c.quality === 'maj7' ? 'maj7' : '';
  return cased + suffix;
}

export interface PaletteEntry {
  digit: number;
  chord: ChordChoice;
  numeral: string;
  name: string;
}

export function paletteFor(key: GoldKey): PaletteEntry[] {
  return [1, 2, 3, 4, 5, 6, 7].map((digit) => {
    const chord = chordForDigit(key, digit, false);
    return { digit, chord, numeral: numeralFor(key, chord), name: chordName(chord) };
  });
}

export type QualityToggle = 'm' | 'd' | 'j';

const TOGGLES: Record<QualityToggle, Partial<Record<GoldQuality, GoldQuality>>> = {
  m: { maj: 'min', min: 'maj', dom7: 'min7', min7: 'dom7', maj7: 'min7' },
  d: { maj: 'dom7', min: 'min7', dom7: 'maj', min7: 'min', maj7: 'dom7' },
  j: { maj: 'maj7', maj7: 'maj', dom7: 'maj7' },
};

export function toggleQuality(c: ChordChoice, which: QualityToggle): ChordChoice {
  if (c.quality === 'N' || c.quality === 'X') return c;
  const next = TOGGLES[which][c.quality];
  return next ? { root: c.root, quality: next } : c;
}

// Mirrors engine/postprocess.py SIMPLIFY_MAP; anything unknown becomes a major triad.
const REDUCE: Record<string, GoldQuality> = {
  dim: 'min', dim7: 'min', hdim7: 'min', min6: 'min', min9: 'min', minmaj7: 'min',
  aug: 'maj', sus2: 'maj', sus4: 'maj', '6': 'maj', '9': 'maj', maj9: 'maj',
};
const VOCAB = new Set<string>(['maj', 'min', 'dom7', 'min7', 'maj7']);

/** Engine chord → the v1 vocabulary. Bass (inversions) is dropped: every metric ignores it. */
export function reduceEngineChord(root: string, quality: string): ChordChoice {
  if (root === 'N' || quality === 'N') return { root: 'N', quality: 'N' };
  const q = VOCAB.has(quality) ? (quality as GoldQuality) : (REDUCE[quality] ?? 'maj');
  return { root: nameOf(pcOf(root)), quality: q };
}
```

Create `web/src/lib/gold/sample.ts`:

```ts
import type { GoldFile } from './types.ts';

/** Test factory: a 12 s song at 120 BPM (24 beats), C major, three engine chords, no spans yet. */
export function sampleGold(over: Partial<GoldFile> = {}): GoldFile {
  return {
    schemaVersion: 1,
    videoId: 'abcdefghijk',
    title: 'Sample Song',
    url: 'https://www.youtube.com/watch?v=abcdefghijk',
    duration: 12,
    key: { tonic: 'C', mode: 'major', source: 'engine' },
    grid: { factor: 1, nudgeSec: 0, beatsPerBar: 4, downbeatBeat: 0 },
    beats: Array.from({ length: 24 }, (_, i) => i * 0.5),
    engine: {
      version: '0.2.1',
      chords: [
        { start: 0, end: 4, root: 'A', quality: 'min', label: 'Am', confidence: 0.5 },
        { start: 4, end: 8, root: 'F', quality: 'maj', label: 'F', confidence: 0.5 },
        { start: 8, end: 12, root: 'C', quality: 'maj', label: 'C', confidence: 0.5 },
      ],
    },
    blind: false,
    spans: [],
    updatedAt: '2026-09-24T00:00:00.000Z',
    ...over,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run src/lib/gold/degrees.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/gold/types.ts web/src/lib/gold/degrees.ts web/src/lib/gold/sample.ts web/src/lib/gold/degrees.test.ts
git commit -m "feat(gold): types and degree/quality math for the annotator" \
           -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Grid math

**Files:**
- Create: `web/src/lib/gold/grid.ts`
- Test: `web/src/lib/gold/grid.test.ts`

**Interfaces:**
- Consumes: `beatIndexAt(beats, t): number` from `web/src/lib/beats.ts` (last index with `beats[i] <= t`, `-1` if none); `GoldGrid` from `types.ts`.
- Produces: `effectiveBeats(beats, {factor, nudgeSec}): number[]`; `LOOSE_CV = 0.08`; `gridQuality(beats): {bpm, cv, loose}`; `meanInterval(beats): number` (0.5 if < 2 beats); `firstBeatAtOrAfter(beats, t): number` (`beats.length` if none); `nearestBeat(beats, t): number` (`-1` if empty); `barEndBeat(beat, beatsPerBar, downbeatBeat): number`; `SheetRow {startBar, startBeat, cols}`; `buildRows(beatCount, beatsPerBar, downbeatBeat, barsPerRow = 4): SheetRow[]`.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/gold/grid.test.ts`:

```ts
import { expect, test } from 'vitest';
import {
  barEndBeat, buildRows, effectiveBeats, firstBeatAtOrAfter, gridQuality, meanInterval, nearestBeat,
} from './grid.ts';

test('effectiveBeats: ½× keeps every other beat, 2× inserts midpoints, nudge shifts', () => {
  const beats = [0, 0.5, 1, 1.5, 2];
  expect(effectiveBeats(beats, { factor: 1, nudgeSec: 0 })).toEqual(beats);
  expect(effectiveBeats(beats, { factor: 0.5, nudgeSec: 0 })).toEqual([0, 1, 2]);
  expect(effectiveBeats(beats, { factor: 2, nudgeSec: 0 })).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
  const nudged = effectiveBeats(beats, { factor: 1, nudgeSec: 0.1 });
  nudged.forEach((b, i) => expect(b).toBeCloseTo(beats[i] + 0.1, 9));
});

test('gridQuality: steady grid vs loose grid', () => {
  const steady = gridQuality(Array.from({ length: 20 }, (_, i) => i * 0.5));
  expect(steady.bpm).toBeCloseTo(120, 6);
  expect(steady.cv).toBeCloseTo(0, 9);
  expect(steady.loose).toBe(false);
  const loose = gridQuality([0, 0.4, 1.0, 1.4, 2.0, 2.4, 3.0]); // 0.4/0.6 alternating, mean 0.5
  expect(loose.cv).toBeCloseTo(0.2, 6);
  expect(loose.loose).toBe(true);
  expect(gridQuality([0, 1])).toEqual({ bpm: 0, cv: 0, loose: false });
});

test('meanInterval falls back to 0.5 with fewer than two beats', () => {
  expect(meanInterval([0, 0.5, 1.5])).toBeCloseTo(0.75, 9);
  expect(meanInterval([])).toBe(0.5);
  expect(meanInterval([3])).toBe(0.5);
});

test('firstBeatAtOrAfter and nearestBeat', () => {
  const b = [0, 0.5, 1];
  expect(firstBeatAtOrAfter(b, 0.5)).toBe(1);
  expect(firstBeatAtOrAfter(b, 0.6)).toBe(2);
  expect(firstBeatAtOrAfter(b, -1)).toBe(0);
  expect(firstBeatAtOrAfter(b, 5)).toBe(3);
  expect(nearestBeat(b, 0.3)).toBe(1);
  expect(nearestBeat(b, 0.2)).toBe(0);
  expect(nearestBeat(b, -1)).toBe(0);
  expect(nearestBeat(b, 9)).toBe(2);
  expect(nearestBeat([], 1)).toBe(-1);
});

test('barEndBeat: the beat index where the bar containing `beat` ends (exclusive)', () => {
  expect(barEndBeat(5, 4, 1)).toBe(9); // bars start at 1,5,9
  expect(barEndBeat(0, 4, 1)).toBe(1); // pickup bar ends at the downbeat
  expect(barEndBeat(4, 4, 0)).toBe(8);
});

test('buildRows: bars per row, pickup padding, empty grid (Review Focus 1)', () => {
  // 10 beats, bar 1 begins at beat 1 → one pickup beat, one row starting 3 beats "before" beat 0
  expect(buildRows(10, 4, 1)).toEqual([{ startBar: -1, startBeat: -3, cols: 16 }]);
  // 40 beats, downbeat 0 → 10 bars → rows at bar 0, 4, 8
  expect(buildRows(40, 4, 0)).toEqual([
    { startBar: 0, startBeat: 0, cols: 16 },
    { startBar: 4, startBeat: 16, cols: 16 },
    { startBar: 8, startBeat: 32, cols: 16 },
  ]);
  expect(buildRows(16, 4, 0)).toHaveLength(1);
  expect(buildRows(24, 3, 0)[0].cols).toBe(12); // 3 beats per bar → 12 columns
  expect(buildRows(0, 4, 0)).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/lib/gold/grid.test.ts`
Expected: FAIL — cannot resolve `./grid.ts`.

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/gold/grid.ts`:

```ts
import { beatIndexAt } from '../beats.ts';
import type { GoldGrid } from './types.ts';

export const LOOSE_CV = 0.08;

/** Engine beats → the grid the user labels on: ½× keeps every other beat, 2× adds midpoints, then nudge. */
export function effectiveBeats(beats: number[], grid: Pick<GoldGrid, 'factor' | 'nudgeSec'>): number[] {
  let out: number[];
  if (grid.factor === 0.5) {
    out = beats.filter((_, i) => i % 2 === 0);
  } else if (grid.factor === 2) {
    out = [];
    beats.forEach((b, i) => {
      out.push(b);
      if (i + 1 < beats.length) out.push((b + beats[i + 1]) / 2);
    });
  } else {
    out = beats.slice();
  }
  return grid.nudgeSec === 0 ? out : out.map((b) => b + grid.nudgeSec);
}

export interface GridQuality {
  bpm: number;
  /** coefficient of variation of the beat spacing */
  cv: number;
  loose: boolean;
}

export function gridQuality(beats: number[]): GridQuality {
  if (beats.length < 3) return { bpm: 0, cv: 0, loose: false };
  const ivs: number[] = [];
  for (let i = 0; i + 1 < beats.length; i++) ivs.push(beats[i + 1] - beats[i]);
  const mean = ivs.reduce((a, b) => a + b, 0) / ivs.length;
  const sd = Math.sqrt(ivs.reduce((a, b) => a + (b - mean) ** 2, 0) / ivs.length);
  const cv = sd / mean;
  return { bpm: 60 / mean, cv, loose: cv > LOOSE_CV };
}

export function meanInterval(beats: number[]): number {
  if (beats.length < 2) return 0.5;
  return (beats[beats.length - 1] - beats[0]) / (beats.length - 1);
}

/** Index of the first beat with time >= t (beats.length if none). */
export function firstBeatAtOrAfter(beats: number[], t: number): number {
  const i = beatIndexAt(beats, t);
  return i >= 0 && beats[i] === t ? i : i + 1;
}

/** Index of the beat nearest to t (-1 if there are no beats). */
export function nearestBeat(beats: number[], t: number): number {
  if (beats.length === 0) return -1;
  const i = beatIndexAt(beats, t);
  if (i < 0) return 0;
  if (i >= beats.length - 1) return beats.length - 1;
  return t - beats[i] <= beats[i + 1] - t ? i : i + 1;
}

/** Beat index where the bar containing `beat` ends (exclusive). Bar 0 starts at `downbeatBeat`. */
export function barEndBeat(beat: number, beatsPerBar: number, downbeatBeat: number): number {
  return downbeatBeat + (Math.floor((beat - downbeatBeat) / beatsPerBar) + 1) * beatsPerBar;
}

export interface SheetRow {
  /** bar index of the row's first bar (0 = the bar starting at the downbeat; -1 = pickup) */
  startBar: number;
  /** beat index of the row's first column (negative → pickup padding before beat 0) */
  startBeat: number;
  cols: number;
}

export function buildRows(
  beatCount: number, beatsPerBar: number, downbeatBeat: number, barsPerRow = 4,
): SheetRow[] {
  const firstBar = 0 - Math.ceil(downbeatBeat / beatsPerBar); // "0 -" avoids a -0
  const lastBar = Math.floor((beatCount - 1 - downbeatBeat) / beatsPerBar);
  const rows: SheetRow[] = [];
  for (let bar = firstBar; bar <= lastBar; bar += barsPerRow) {
    rows.push({ startBar: bar, startBeat: downbeatBeat + bar * beatsPerBar, cols: barsPerRow * beatsPerBar });
  }
  return rows;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run src/lib/gold/grid.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/gold/grid.ts web/src/lib/gold/grid.test.ts
git commit -m "feat(gold): beat-grid math for the annotator" \
           -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Span editing

**Files:**
- Create: `web/src/lib/gold/spans.ts`
- Test: `web/src/lib/gold/spans.test.ts`

**Interfaces:**
- Consumes: `ChordChoice`, `EngineChord`, `Flag`, `GoldSpan`, `Provenance` (types); `harteLabel`, `nameOf`, `pcOf`, `reduceEngineChord`, `toggleQuality`, `QualityToggle` (degrees).
- Produces: `MAX_AUTO_EXTEND_BARS = 4`; `Ghost {start, end, chord}`; `PlaceOpts {t, chord, barEnd, duration, tol, autoExtendMax, flag?}`; `PlaceBase = Omit<PlaceOpts,'t'|'chord'>`; `computeGhosts(engine, spans, blind): Ghost[]`; `spanAt(spans, t)`; `ghostAt(ghosts, t)`; `placeChord(spans, ghosts, opts): GoldSpan[]`; `confirmGhost(spans, ghosts, t): {spans, next} | null`; `clearAt(spans, t): GoldSpan[]`; `retoneAt(spans, ghosts, t, which, base): GoldSpan[]`; `transposeSpans(spans, semitones): GoldSpan[]`. All operations are pure and return the **same array reference** when nothing changed.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/gold/spans.test.ts`:

```ts
import { expect, test } from 'vitest';
import { harteLabel } from './degrees.ts';
import {
  clearAt, computeGhosts, confirmGhost, placeChord, retoneAt, spanAt, transposeSpans,
  type PlaceOpts,
} from './spans.ts';
import type { ChordChoice, EngineChord, Flag, GoldSpan, Provenance } from './types.ts';

const am: ChordChoice = { root: 'A', quality: 'min' };
const f: ChordChoice = { root: 'F', quality: 'maj' };
const g: ChordChoice = { root: 'G', quality: 'maj' };

const eng = (start: number, end: number, root: string, quality: string): EngineChord =>
  ({ start, end, root, quality, label: root, confidence: 0.5 });
const ENGINE = [eng(0, 4, 'A', 'min'), eng(4, 8, 'F', 'maj'), eng(8, 12, 'C', 'maj')];

const span = (start: number, end: number, chord: ChordChoice, flag: Flag = 'guess', source: Provenance = 'manual'): GoldSpan =>
  ({ start, end, root: chord.root, quality: chord.quality, label: harteLabel(chord), flag, source });

const opts = (t: number, chord: ChordChoice, extra: Partial<PlaceOpts> = {}): PlaceOpts =>
  ({ t, chord, barEnd: t + 2, duration: 16, tol: 0.2, autoExtendMax: 8, ...extra });

test('computeGhosts: engine chords minus placed spans; blind hides them', () => {
  expect(computeGhosts(ENGINE, [], false).map((x) => [x.start, x.end, x.chord.root])).toEqual([
    [0, 4, 'A'], [4, 8, 'F'], [8, 12, 'C'],
  ]);
  const cut = computeGhosts(ENGINE, [span(2, 4, am)], false);
  expect(cut.map((x) => [x.start, x.end])).toEqual([[0, 2], [4, 8], [8, 12]]);
  const across = computeGhosts(ENGINE, [span(3, 9, g)], false);
  expect(across.map((x) => [x.start, x.end])).toEqual([[0, 3], [9, 12]]); // F fully covered
  expect(computeGhosts(ENGINE, [], true)).toEqual([]);
});

test('spanAt: boundary belongs to the later span', () => {
  const spans = [span(0, 4, am), span(4, 8, f)];
  expect(spanAt(spans, 0)?.label).toBe('A:min');
  expect(spanAt(spans, 4)?.label).toBe('F:maj');
  expect(spanAt(spans, 3.9999999)?.label).toBe('F:maj'); // float noise at the boundary
  expect(spanAt(spans, 8)).toBeUndefined();
});

test('placing on a ghost start: same chord = confirmed, different = edited, over the ghost extent', () => {
  const ghosts = computeGhosts(ENGINE, [], false);
  const same = placeChord([], ghosts, opts(4, f));
  expect(same).toEqual([{ ...span(4, 8, f), source: 'confirmed' }]);
  const diff = placeChord([], ghosts, opts(4, g));
  expect(diff).toEqual([{ ...span(4, 8, g), source: 'edited' }]);
});

test('placing mid-ghost splits: new span runs to the ghost end, the head stays a ghost', () => {
  const ghosts = computeGhosts(ENGINE, [], false);
  const out = placeChord([], ghosts, opts(5, g));
  expect(out).toEqual([{ ...span(5, 8, g), source: 'edited' }]);
  const after = computeGhosts(ENGINE, out, false);
  expect(after.map((x) => [x.start, x.end, x.chord.root])).toEqual([[0, 4, 'A'], [4, 5, 'F'], [8, 12, 'C']]);
});

test('placing on an existing span start replaces it; confirmed→edited only when the chord changes', () => {
  const spans = [span(0, 4, am, 'guess', 'confirmed')];
  const changed = placeChord(spans, [], opts(0, g));
  expect(changed).toEqual([{ ...span(0, 4, g), source: 'edited' }]);
  const same = placeChord(spans, [], opts(0, am));
  expect(same[0].source).toBe('confirmed');
});

test('placing mid-span splits: head keeps its label (confirmed→edited), tail is edited (or manual)', () => {
  const confirmed = [span(0, 8, am, 'guess', 'confirmed')];
  expect(placeChord(confirmed, [], opts(3, f))).toEqual([
    { ...span(0, 3, am), source: 'edited' },
    { ...span(3, 8, f), source: 'edited' },
  ]);
  const manual = [span(0, 8, am, 'guess', 'manual')];
  expect(placeChord(manual, [], opts(3, f))).toEqual([span(0, 3, am), span(3, 8, f)]);
});

test('empty region: default length is the rest of the bar, capped by the next span', () => {
  expect(placeChord([], [], opts(2, f, { barEnd: 4 }))).toEqual([span(2, 4, f)]);
  const withNext = placeChord([span(3, 6, am)], [], opts(2, f, { barEnd: 4 }));
  expect(withNext.map((s) => [s.start, s.end])).toEqual([[2, 3], [3, 6]]);
});

test('a later chord auto-extends the preceding span across a gap, up to the cap', () => {
  const before = [span(0, 2, am)];
  const extended = placeChord(before, [], opts(6, f, { barEnd: 8, autoExtendMax: 8 }));
  expect(extended.map((s) => [s.start, s.end, s.label])).toEqual([[0, 6, 'A:min'], [6, 8, 'F:maj']]);
  const capped = placeChord(before, [], opts(6, f, { barEnd: 8, autoExtendMax: 3 })); // gap is 4 > 3
  expect(capped.map((s) => [s.start, s.end])).toEqual([[0, 2], [6, 8]]);
});

test('no auto-extend across unreviewed engine chords in the gap', () => {
  const before = [span(0, 2, am)];
  const ghosts = [{ start: 3, end: 5, chord: am }];
  const out = placeChord(before, ghosts, opts(6, f, { barEnd: 8 }));
  expect(out.map((s) => [s.start, s.end])).toEqual([[0, 2], [6, 8]]);
});

test('placing at or after the end of the song is a no-op (Review Focus 5)', () => {
  const spans = [span(0, 2, am)];
  expect(placeChord(spans, [], opts(16, f))).toBe(spans);
  expect(placeChord(spans, [], opts(99, f))).toBe(spans);
  expect(placeChord(spans, [], opts(-1, f))).toBe(spans);
  const tail = placeChord(spans, [], opts(15.9, f, { barEnd: 18 }));
  expect(tail[1].end).toBe(16); // clamped to the duration
});

test('X and N marks: X is flag skip / label X, N keeps guess', () => {
  const x = placeChord([], [], opts(2, { root: null, quality: 'X' }, { barEnd: 4 }));
  expect(x).toEqual([{ start: 2, end: 4, root: null, quality: 'X', label: 'X', flag: 'skip', source: 'manual' }]);
  const n = placeChord([], [], opts(2, { root: 'N', quality: 'N' }, { barEnd: 4 }));
  expect(n[0]).toMatchObject({ label: 'N', flag: 'guess' });
});

test('confirmGhost turns the ghost under t into a confirmed guess and reports where to go next', () => {
  const ghosts = computeGhosts(ENGINE, [], false);
  const r = confirmGhost([], ghosts, 5);
  expect(r?.next).toBe(8);
  expect(r?.spans).toEqual([{ ...span(4, 8, f), source: 'confirmed' }]);
  expect(confirmGhost([], [], 5)).toBeNull();
});

test('clearAt removes the span under t (the engine ghost reappears); no-op returns the same array', () => {
  const spans = [span(4, 8, g, 'guess', 'edited')];
  const cleared = clearAt(spans, 5);
  expect(cleared).toEqual([]);
  expect(computeGhosts(ENGINE, cleared, false).some((x) => x.start === 4 && x.chord.root === 'F')).toBe(true);
  expect(clearAt(spans, 1)).toBe(spans);
});

test('retoneAt: toggles the chord under t over its full extent; unchanged returns the same array', () => {
  const ghosts = computeGhosts(ENGINE, [], false);
  const base = { barEnd: 4, duration: 16, tol: 0.2, autoExtendMax: 8 };
  const fromGhost = retoneAt([], ghosts, 5, 'd', base);
  expect(fromGhost).toEqual([{ ...span(4, 8, { root: 'F', quality: 'dom7' }), source: 'edited' }]);
  const spans = [span(4, 8, g, 'guess', 'confirmed')];
  const minor = retoneAt(spans, [], 5, 'm', base);
  expect(minor).toEqual([{ ...span(4, 8, { root: 'G', quality: 'min' }), source: 'edited' }]);
  const n = [span(0, 2, { root: 'N', quality: 'N' })];
  expect(retoneAt(n, [], 1, 'm', base)).toBe(n);
  expect(retoneAt([], [], 1, 'm', base)).toEqual([]);
});

test('transposeSpans shifts roots and relabels; X and N are untouched', () => {
  const spans = [span(0, 2, am), span(2, 4, { root: 'N', quality: 'N' }), span(4, 6, { root: null, quality: 'X' }, 'skip')];
  const up = transposeSpans(spans, 2);
  expect(up[0]).toMatchObject({ root: 'B', label: 'B:min' });
  expect(up[1]).toBe(spans[1]);
  expect(up[2]).toBe(spans[2]);
  expect(transposeSpans(spans, 12)).toBe(spans);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/lib/gold/spans.test.ts`
Expected: FAIL — cannot resolve `./spans.ts`.

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/gold/spans.ts`:

```ts
import type { ChordChoice, EngineChord, Flag, GoldSpan, Provenance } from './types.ts';
import { harteLabel, nameOf, pcOf, reduceEngineChord, toggleQuality, type QualityToggle } from './degrees.ts';

const EPS = 1e-6;

/** A preceding span may auto-extend across a gap of at most this many bars. */
export const MAX_AUTO_EXTEND_BARS = 4;

/** An unreviewed engine chord (or the unreviewed remainder of one). Never persisted. */
export interface Ghost {
  start: number;
  end: number;
  chord: ChordChoice;
}

export interface PlaceOpts {
  /** time of the cursor beat, seconds */
  t: number;
  chord: ChordChoice;
  /** time at which the bar containing t ends (default end for a chord in an empty region) */
  barEnd: number;
  duration: number;
  /** a cursor within `tol` of a chip's start counts as being ON its first beat */
  tol: number;
  /** longest gap (seconds) a preceding span may auto-extend across */
  autoExtendMax: number;
  flag?: Flag;
}
export type PlaceBase = Omit<PlaceOpts, 't' | 'chord'>;

const sameChord = (a: ChordChoice, b: ChordChoice) => a.root === b.root && a.quality === b.quality;
const chordOf = (s: GoldSpan): ChordChoice => ({ root: s.root, quality: s.quality });
const byStart = (a: { start: number }, b: { start: number }) => a.start - b.start;

function makeSpan(start: number, end: number, chord: ChordChoice, flag: Flag, source: Provenance): GoldSpan {
  return { start, end, root: chord.root, quality: chord.quality, label: harteLabel(chord), flag, source };
}

/** Engine chords minus everything already covered by a span. Blind mode hides them all. */
export function computeGhosts(engine: EngineChord[], spans: GoldSpan[], blind: boolean): Ghost[] {
  if (blind) return [];
  const out: Ghost[] = [];
  for (const e of engine) {
    let pieces: Array<[number, number]> = [[e.start, e.end]];
    for (const s of spans) {
      if (s.end <= e.start + EPS || s.start >= e.end - EPS) continue;
      const next: Array<[number, number]> = [];
      for (const [a, b] of pieces) {
        if (s.end <= a + EPS || s.start >= b - EPS) {
          next.push([a, b]);
          continue;
        }
        if (s.start > a + EPS) next.push([a, s.start]);
        if (s.end < b - EPS) next.push([s.end, b]);
      }
      pieces = next;
    }
    const chord = reduceEngineChord(e.root, e.quality);
    for (const [a, b] of pieces) if (b - a > EPS) out.push({ start: a, end: b, chord });
  }
  return out.sort(byStart);
}

export function spanAt(spans: GoldSpan[], t: number): GoldSpan | undefined {
  return spans.find((s) => s.start <= t + EPS && t < s.end - EPS);
}

export function ghostAt(ghosts: Ghost[], t: number): Ghost | undefined {
  return ghosts.find((g) => g.start <= t + EPS && t < g.end - EPS);
}

function placeInEmpty(spans: GoldSpan[], ghosts: Ghost[], o: PlaceOpts, flag: Flag): GoldSpan[] {
  const nextSpan = spans.find((s) => s.start > o.t);
  const nextGhost = ghosts.find((g) => g.start > o.t);
  const end = Math.min(o.barEnd, o.duration, nextSpan?.start ?? Infinity, nextGhost?.start ?? Infinity);
  if (end - o.t <= EPS) return spans;
  const prev = [...spans].reverse().find((s) => s.end <= o.t + EPS);
  let out = spans;
  if (
    prev && o.t - prev.end > EPS && o.t - prev.end <= o.autoExtendMax &&
    !ghosts.some((g) => g.end > prev.end + EPS && g.start < o.t - EPS)
  ) {
    const extended: GoldSpan = { ...prev, end: o.t, source: prev.source === 'confirmed' ? 'edited' : prev.source };
    out = out.map((s) => (s === prev ? extended : s));
  }
  return [...out, makeSpan(o.t, end, o.chord, flag, 'manual')].sort(byStart);
}

/** Place `chord` at time t following the spec's extension rule. Returns the same array if nothing changed. */
export function placeChord(spans: GoldSpan[], ghosts: Ghost[], o: PlaceOpts): GoldSpan[] {
  const flag: Flag = o.chord.quality === 'X' ? 'skip' : (o.flag ?? 'guess');
  if (o.t >= o.duration - EPS || o.t < -EPS) return spans;

  const span = spanAt(spans, o.t);
  if (span) {
    if (o.t - span.start < o.tol) {
      const changed = !sameChord(chordOf(span), o.chord);
      const source: Provenance = span.source === 'confirmed' && changed ? 'edited' : span.source;
      const replaced = makeSpan(span.start, span.end, o.chord, flag, source);
      return spans.map((s) => (s === span ? replaced : s));
    }
    const head: GoldSpan = { ...span, end: o.t, source: span.source === 'confirmed' ? 'edited' : span.source };
    const tail = makeSpan(o.t, span.end, o.chord, flag, span.source === 'manual' ? 'manual' : 'edited');
    return spans.flatMap((s) => (s === span ? [head, tail] : [s]));
  }

  const ghost = ghostAt(ghosts, o.t);
  if (ghost) {
    const atStart = o.t - ghost.start < o.tol;
    const start = atStart ? ghost.start : o.t;
    const source: Provenance = atStart && sameChord(ghost.chord, o.chord) ? 'confirmed' : 'edited';
    return [...spans, makeSpan(start, ghost.end, o.chord, flag, source)].sort(byStart);
  }

  return placeInEmpty(spans, ghosts, o, flag);
}

/** Enter: accept the ghost under t as a confirmed guess. `next` is where the cursor should go. */
export function confirmGhost(
  spans: GoldSpan[], ghosts: Ghost[], t: number,
): { spans: GoldSpan[]; next: number } | null {
  const g = ghostAt(ghosts, t);
  if (!g) return null;
  return {
    spans: [...spans, makeSpan(g.start, g.end, g.chord, 'guess', 'confirmed')].sort(byStart),
    next: g.end,
  };
}

/** Backspace: remove the span under t. (Its engine ghost, if any, reappears as unreviewed.) */
export function clearAt(spans: GoldSpan[], t: number): GoldSpan[] {
  const s = spanAt(spans, t);
  return s ? spans.filter((x) => x !== s) : spans;
}

/** m / d / j: toggle the quality of the chord under t (a span or a ghost) over its full extent. */
export function retoneAt(
  spans: GoldSpan[], ghosts: Ghost[], t: number, which: QualityToggle, base: PlaceBase,
): GoldSpan[] {
  const span = spanAt(spans, t);
  const ghost = span ? undefined : ghostAt(ghosts, t);
  const current = span ? chordOf(span) : ghost?.chord;
  const start = span ? span.start : ghost?.start;
  if (!current || start === undefined) return spans;
  const next = toggleQuality(current, which);
  if (sameChord(next, current)) return spans;
  return placeChord(spans, ghosts, { ...base, t: start, chord: next });
}

/** Shift every chord's root (X and N untouched) and relabel. */
export function transposeSpans(spans: GoldSpan[], semitones: number): GoldSpan[] {
  if (semitones % 12 === 0) return spans;
  return spans.map((s) => {
    if (s.root === null || s.root === 'N') return s;
    const chord: ChordChoice = { root: nameOf(pcOf(s.root) + semitones), quality: s.quality };
    return { ...s, root: chord.root, label: harteLabel(chord) };
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run src/lib/gold/spans.test.ts`
Expected: PASS (14 tests). If a boundary test fails, re-read `spanAt`/`EPS` handling before touching the tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/gold/spans.ts web/src/lib/gold/spans.test.ts
git commit -m "feat(gold): span editing rules (place/split/confirm/clear/retone/transpose)" \
           -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `.lab` export, validation, and the scorer contract

**Files:**
- Create: `web/src/lib/gold/lab.ts`, `web/src/lib/gold/validate.ts`, `tests/fixtures/gold_sample.lab`, `tests/test_gold_contract.py`
- Test: `web/src/lib/gold/lab.test.ts`, `web/src/lib/gold/validate.test.ts`, `web/tools/lab-contract.test.ts`

**Interfaces:**
- Consumes: `GoldFile`, `GoldSpan` (types); `PITCH_NAMES` (degrees); `VIDEO_ID_RE` (types); `sampleGold` (Task 1).
- Produces: `LabTier = 'labeled' | 'sure'`; `toLab(file: Pick<GoldFile,'spans'|'duration'>, tier): string`; `labeledSeconds(spans): number`; `validateGold(input: unknown, expectedId?: string): {ok:true; file: GoldFile} | {ok:false; error: string}`.

- [ ] **Step 1: Write the failing tests**

Create `web/src/lib/gold/lab.test.ts`:

```ts
import { expect, test } from 'vitest';
import { harteLabel } from './degrees.ts';
import { labeledSeconds, toLab } from './lab.ts';
import type { ChordChoice, Flag, GoldSpan } from './types.ts';

const sp = (start: number, end: number, chord: ChordChoice, flag: Flag): GoldSpan =>
  ({ start, end, root: chord.root, quality: chord.quality, label: harteLabel(chord), flag, source: 'manual' });

const A = { root: 'A', quality: 'min' } as const;
const F = { root: 'F', quality: 'maj' } as const;
const C = { root: 'C', quality: 'maj' } as const;
const spans = [sp(2, 4, A, 'guess'), sp(4, 6, F, 'guess'), sp(6, 8, C, 'sure')];

test('labeled tier: sure + guess as Harte, gaps as X, covering 0 → duration', () => {
  expect(toLab({ spans, duration: 12 }, 'labeled')).toBe(
    '0.000 2.000 X\n2.000 4.000 A:min\n4.000 6.000 F:maj\n6.000 8.000 C:maj\n8.000 12.000 X\n',
  );
});

test('sure tier: only sure spans; adjacent X runs merge', () => {
  expect(toLab({ spans, duration: 12 }, 'sure')).toBe('0.000 6.000 X\n6.000 8.000 C:maj\n8.000 12.000 X\n');
});

test('no spans → a single X line; a skip span is X; N is kept (labeled) but not "sure"', () => {
  expect(toLab({ spans: [], duration: 12 }, 'labeled')).toBe('0.000 12.000 X\n');
  const skip = sp(0, 4, { root: null, quality: 'X' }, 'skip');
  expect(toLab({ spans: [skip], duration: 4 }, 'labeled')).toBe('0.000 4.000 X\n');
  const n = sp(0, 4, { root: 'N', quality: 'N' }, 'guess');
  expect(toLab({ spans: [n], duration: 4 }, 'labeled')).toBe('0.000 4.000 N\n');
  expect(toLab({ spans: [n], duration: 4 }, 'sure')).toBe('0.000 4.000 X\n');
});

test('labeledSeconds excludes skip spans', () => {
  const withSkip = [...spans, sp(8, 10, { root: null, quality: 'X' }, 'skip')];
  expect(labeledSeconds(withSkip)).toBe(6);
});
```

Create `web/src/lib/gold/validate.test.ts`:

```ts
import { expect, test } from 'vitest';
import { sampleGold } from './sample.ts';
import { validateGold } from './validate.ts';
import type { GoldFile, GoldSpan } from './types.ts';

const span = (over: Partial<GoldSpan> = {}): GoldSpan => ({
  start: 2, end: 4, root: 'A', quality: 'min', label: 'A:min', flag: 'guess', source: 'manual', ...over,
});
const withSpans = (spans: GoldSpan[]): GoldFile => sampleGold({ spans });
const bad = (input: unknown, id?: string) => {
  const r = validateGold(input, id);
  if (r.ok) throw new Error('expected a validation failure');
  return r.error;
};

test('accepts a valid file and returns it', () => {
  const file = withSpans([span(), span({ start: 4, end: 6, root: 'F', label: 'F:maj', quality: 'maj' })]);
  const r = validateGold(file, 'abcdefghijk');
  expect(r.ok).toBe(true);
});

test('rejects non-objects, wrong schema version, bad or mismatched ids', () => {
  expect(bad(null)).toMatch(/object/);
  expect(bad({ ...sampleGold(), schemaVersion: 2 })).toMatch(/schemaVersion/);
  expect(bad({ ...sampleGold(), videoId: '../etc/passwd' })).toMatch(/videoId/);
  expect(bad(sampleGold(), 'zzzzzzzzzzz')).toMatch(/does not match/);
});

test('rejects overlapping, unsorted, out-of-range and zero-length spans', () => {
  expect(bad(withSpans([span({ start: 2, end: 5 }), span({ start: 4, end: 6 })]))).toMatch(/overlap|sorted/);
  expect(bad(withSpans([span({ start: 5, end: 6 }), span({ start: 2, end: 3 })]))).toMatch(/overlap|sorted/);
  expect(bad(withSpans([span({ start: 10, end: 13 })]))).toMatch(/duration/);
  expect(bad(withSpans([span({ start: 3, end: 3 })]))).toMatch(/end/);
});

test('rejects bad quality/flag/source and inconsistent X spans', () => {
  expect(bad(withSpans([span({ quality: 'dim' as never })]))).toMatch(/quality/);
  expect(bad(withSpans([span({ flag: 'maybe' as never })]))).toMatch(/flag/);
  expect(bad(withSpans([span({ source: 'guessed' as never })]))).toMatch(/source/);
  expect(bad(withSpans([span({ quality: 'X', root: 'A', label: 'X', flag: 'skip' })]))).toMatch(/X span/);
  expect(bad(withSpans([span({ quality: 'X', root: null, label: 'X', flag: 'guess' })]))).toMatch(/X span/);
});

test('rejects a bad key, grid, or beats array', () => {
  expect(bad({ ...sampleGold(), key: { tonic: 'H', mode: 'major', source: 'engine' } })).toMatch(/key/);
  expect(bad({ ...sampleGold(), grid: { factor: 3, nudgeSec: 0, beatsPerBar: 4, downbeatBeat: 0 } })).toMatch(/grid/);
  expect(bad({ ...sampleGold(), beats: 'nope' })).toMatch(/beats/);
  expect(bad({ ...sampleGold(), beats: Array.from({ length: 20001 }, (_, i) => i) })).toMatch(/beats/);
});
```

Create `web/tools/lab-contract.test.ts` (node environment so it can read the shared fixture):

```ts
// @vitest-environment node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { toLab } from '../src/lib/gold/lab.ts';
import { harteLabel } from '../src/lib/gold/degrees.ts';
import type { ChordChoice, Flag, GoldSpan } from '../src/lib/gold/types.ts';

const sp = (start: number, end: number, chord: ChordChoice, flag: Flag): GoldSpan =>
  ({ start, end, root: chord.root, quality: chord.quality, label: harteLabel(chord), flag, source: 'manual' });

// The Python side (tests/test_gold_contract.py) loads and scores this same file.
test('the exporter reproduces tests/fixtures/gold_sample.lab byte for byte', () => {
  const fixture = fs.readFileSync(
    fileURLToPath(new URL('../../tests/fixtures/gold_sample.lab', import.meta.url)), 'utf8',
  );
  const spans = [
    sp(2, 4, { root: 'A', quality: 'min' }, 'guess'),
    sp(4, 6, { root: 'F', quality: 'maj' }, 'guess'),
    sp(6, 8, { root: 'C', quality: 'maj' }, 'sure'),
  ];
  expect(toLab({ spans, duration: 12 }, 'labeled')).toBe(fixture);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run src/lib/gold/lab.test.ts src/lib/gold/validate.test.ts tools/lab-contract.test.ts`
Expected: FAIL — cannot resolve `./lab.ts` / `./validate.ts`.

- [ ] **Step 3: Write the implementation and the shared fixture**

Create `web/src/lib/gold/lab.ts`:

```ts
import type { GoldFile, GoldSpan } from './types.ts';

/** 'labeled' = sure + guess spans; 'sure' = sure spans only. Everything else is X. */
export type LabTier = 'labeled' | 'sure';

const fmt = (n: number) => n.toFixed(3);

/** GoldFile → Harte `.lab` text covering 0 → duration contiguously (gaps and skips as X). */
export function toLab(file: Pick<GoldFile, 'spans' | 'duration'>, tier: LabTier): string {
  const rows: Array<[number, number, string]> = [];
  const push = (start: number, end: number, label: string) => {
    if (end - start <= 1e-9) return;
    const last = rows[rows.length - 1];
    if (label === 'X' && last && last[2] === 'X' && Math.abs(last[1] - start) < 1e-9) {
      last[1] = end;
      return;
    }
    rows.push([start, end, label]);
  };
  let cursor = 0;
  for (const s of file.spans) {
    if (s.start > cursor) push(cursor, s.start, 'X');
    const labeled = s.flag !== 'skip' && (tier === 'labeled' || s.flag === 'sure');
    push(s.start, s.end, labeled ? s.label : 'X');
    cursor = s.end;
  }
  if (cursor < file.duration) push(cursor, file.duration, 'X');
  if (rows.length === 0) rows.push([0, file.duration, 'X']);
  return rows.map(([a, b, l]) => `${fmt(a)} ${fmt(b)} ${l}`).join('\n') + '\n';
}

/** Seconds covered by non-skip spans. */
export function labeledSeconds(spans: GoldSpan[]): number {
  return spans.filter((s) => s.flag !== 'skip').reduce((sum, s) => sum + (s.end - s.start), 0);
}
```

Create `web/src/lib/gold/validate.ts`:

```ts
import { PITCH_NAMES } from './degrees.ts';
import { VIDEO_ID_RE, type GoldFile } from './types.ts';

export type Validation = { ok: true; file: GoldFile } | { ok: false; error: string };

const QUALITIES = new Set(['maj', 'min', 'dom7', 'min7', 'maj7', 'N', 'X']);
const FLAGS = new Set(['sure', 'guess', 'skip']);
const SOURCES = new Set(['confirmed', 'edited', 'manual']);
const MAX_BEATS = 20000;
const MAX_SPANS = 5000;
const MAX_ENGINE = 5000;
const TOL = 1e-6;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate an untrusted body as a GoldFile. `expectedId` (from the URL) must equal `videoId`. */
export function validateGold(input: unknown, expectedId?: string): Validation {
  const fail = (error: string): Validation => ({ ok: false, error });
  if (!isObj(input)) return fail('body must be an object');
  if (input.schemaVersion !== 1) return fail('schemaVersion must be 1');
  if (typeof input.videoId !== 'string' || !VIDEO_ID_RE.test(input.videoId)) return fail('invalid videoId');
  if (expectedId !== undefined && input.videoId !== expectedId) return fail('videoId does not match the URL');
  if (typeof input.title !== 'string' || typeof input.url !== 'string') return fail('title and url must be strings');
  if (!isNum(input.duration) || input.duration <= 0) return fail('duration must be a positive number');
  const duration = input.duration;

  const key = input.key;
  if (!isObj(key) || !(PITCH_NAMES as readonly string[]).includes(String(key.tonic)) ||
      (key.mode !== 'major' && key.mode !== 'minor') || (key.source !== 'engine' && key.source !== 'user')) {
    return fail('invalid key');
  }

  const grid = input.grid;
  if (!isObj(grid) || ![0.5, 1, 2].includes(grid.factor as number) || !isNum(grid.nudgeSec) ||
      !Number.isInteger(grid.beatsPerBar) || (grid.beatsPerBar as number) < 1 || (grid.beatsPerBar as number) > 12 ||
      !Number.isInteger(grid.downbeatBeat) || (grid.downbeatBeat as number) < 0) {
    return fail('invalid grid');
  }

  if (!Array.isArray(input.beats) || input.beats.length > MAX_BEATS || !input.beats.every(isNum)) {
    return fail('invalid beats');
  }

  const engine = input.engine;
  if (!isObj(engine) || typeof engine.version !== 'string' || !Array.isArray(engine.chords) ||
      engine.chords.length > MAX_ENGINE ||
      !engine.chords.every((c) => isObj(c) && isNum(c.start) && isNum(c.end) && typeof c.root === 'string' &&
        typeof c.quality === 'string' && typeof c.label === 'string' && isNum(c.confidence))) {
    return fail('invalid engine snapshot');
  }

  if (typeof input.blind !== 'boolean') return fail('blind must be a boolean');
  if (typeof input.updatedAt !== 'string') return fail('updatedAt must be a string');

  if (!Array.isArray(input.spans) || input.spans.length > MAX_SPANS) return fail('invalid spans');
  let prevEnd = 0;
  for (const [i, s] of input.spans.entries()) {
    const at = `span ${i}`;
    if (!isObj(s)) return fail(`${at} must be an object`);
    if (!isNum(s.start) || !isNum(s.end)) return fail(`${at}: start and end must be numbers`);
    if (s.end <= s.start) return fail(`${at}: end must be after start`);
    if (s.start < prevEnd - TOL) return fail(`${at}: spans must be sorted and must not overlap`);
    if (s.end > duration + TOL) return fail(`${at}: end exceeds the song duration`);
    if (typeof s.quality !== 'string' || !QUALITIES.has(s.quality)) return fail(`${at}: invalid quality`);
    if (typeof s.flag !== 'string' || !FLAGS.has(s.flag)) return fail(`${at}: invalid flag`);
    if (typeof s.source !== 'string' || !SOURCES.has(s.source)) return fail(`${at}: invalid source`);
    if (typeof s.label !== 'string') return fail(`${at}: label must be a string`);
    const isX = s.quality === 'X';
    if (isX !== (s.flag === 'skip') || isX !== (s.root === null) || (!isX && typeof s.root !== 'string')) {
      return fail(`${at}: an X span must have root null and flag skip (and only X spans)`);
    }
    prevEnd = s.end;
  }
  return { ok: true, file: input as unknown as GoldFile };
}
```

Create `tests/fixtures/gold_sample.lab` (exactly this content, trailing newline included):

```
0.000 2.000 X
2.000 4.000 A:min
4.000 6.000 F:maj
6.000 8.000 C:maj
8.000 12.000 X
```

Create `tests/test_gold_contract.py`:

```python
"""Contract between the annotator tool (web/) and the existing scorer.

tests/fixtures/gold_sample.lab is produced byte-for-byte by web/src/lib/gold/lab.ts
(asserted by web/tools/lab-contract.test.ts). Here the same file is loaded and scored
by engine.eval to prove the scorer needs no converter and ignores X spans.
"""
from pathlib import Path

import numpy as np
import pytest

from engine.eval import load_lab, score_chart

FIXTURE = Path(__file__).parent / "fixtures" / "gold_sample.lab"


def test_gold_lab_loads_and_covers_the_song_contiguously():
    intervals, labels = load_lab(FIXTURE)
    assert labels == ["X", "A:min", "F:maj", "C:maj", "X"]
    assert intervals[0][0] == 0.0 and intervals[-1][1] == 12.0
    assert np.all(intervals[1:, 0] == intervals[:-1, 1])


def test_scorer_ignores_x_spans_on_every_metric():
    ref_int, ref_lab = load_lab(FIXTURE)
    est_int = np.array([[0.0, 4.0], [4.0, 6.0], [6.0, 8.0], [8.0, 12.0]])
    est_lab = ["A:min", "F:maj", "G:maj", "N"]
    scores = score_chart(ref_int, ref_lab, est_int, est_lab)
    # Of the three labeled 2-second spans, two match; the X gap and X tail do not count.
    for metric in ("root", "majmin", "sevenths"):
        assert scores[metric] == pytest.approx(4 / 6)
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd web && npx vitest run src/lib/gold/lab.test.ts src/lib/gold/validate.test.ts tools/lab-contract.test.ts`
Expected: PASS.
Run: `cd .. && .venv/bin/python -m pytest tests/test_gold_contract.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/gold/lab.ts web/src/lib/gold/validate.ts web/src/lib/gold/lab.test.ts \
        web/src/lib/gold/validate.test.ts web/tools/lab-contract.test.ts \
        tests/fixtures/gold_sample.lab tests/test_gold_contract.py
git commit -m "feat(gold): .lab export, file validation, and the scorer contract test" \
           -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

Note: `web/tools/lab-contract.test.ts` is only type-checked once Task 5 adds `tools` to `tsconfig.node.json`; vitest runs it regardless.

---

### Task 5: Gold store and dev-only Vite middleware

**Files:**
- Create: `web/tools/gold-plugin.ts`
- Modify: `web/vite.config.ts`, `web/tsconfig.node.json`
- Test: `web/tools/gold-plugin.test.ts`

**Interfaces:**
- Consumes: `toLab`, `labeledSeconds` (Task 4); `validateGold` (Task 4); `VIDEO_ID_RE`, `GoldFile`, `GoldSummary` (types).
- Produces: `MAX_BODY_BYTES = 2 * 1024 * 1024`; `createGoldStore(dir): {list(): GoldSummary[]; read(id): string | null; write(id, body): {ok:true} | {ok:false; status:number; error:string}}`; `goldHandler(store): (req, res) => void`; `goldPlugin(dir): Plugin`. HTTP contract (mounted at `/__gold`): `GET /` → summaries; `GET /<id>` → the JSON file or 404; `PUT /<id>` (`Content-Type: application/json`, ≤ 2 MB) → `{ok:true}` or `4xx {error}`.

- [ ] **Step 1: Write the failing test**

Create `web/tools/gold-plugin.test.ts`:

```ts
// @vitest-environment node
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { sampleGold } from '../src/lib/gold/sample.ts';
import type { GoldFile } from '../src/lib/gold/types.ts';
import { createGoldStore, goldHandler, MAX_BODY_BYTES, type GoldStore } from './gold-plugin.ts';

let dir: string;
let store: GoldStore;
let server: http.Server | null = null;

const labeled = (): GoldFile =>
  sampleGold({
    spans: [{ start: 2, end: 4, root: 'A', quality: 'min', label: 'A:min', flag: 'guess', source: 'confirmed' }],
  });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gold-'));
  store = createGoldStore(path.join(dir, 'annotations'));
});
afterEach(async () => {
  if (server) await new Promise((r) => server!.close(r));
  server = null;
  fs.rmSync(dir, { recursive: true, force: true });
});

async function serve(): Promise<string> {
  server = http.createServer(goldHandler(store));
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('write creates json + both .lab files atomically (no tmp files left)', () => {
  const r = store.write('abcdefghijk', labeled());
  expect(r).toEqual({ ok: true });
  const a = path.join(dir, 'annotations');
  expect(fs.readdirSync(a).sort()).toEqual(['abcdefghijk.json', 'abcdefghijk.lab', 'abcdefghijk.sure.lab']);
  expect(fs.readFileSync(path.join(a, 'abcdefghijk.lab'), 'utf8')).toContain('2.000 4.000 A:min');
  expect(fs.readFileSync(path.join(a, 'abcdefghijk.sure.lab'), 'utf8')).toBe('0.000 12.000 X\n');
  const saved = JSON.parse(fs.readFileSync(path.join(a, 'abcdefghijk.json'), 'utf8'));
  expect(saved.spans[0].label).toBe('A:min');
  expect(Object.keys(saved)[0]).toBe('schemaVersion'); // canonical key order
});

test('write rejects bad ids, id/body mismatch, and invalid spans without touching disk', () => {
  expect(store.write('../etc/passwd', labeled())).toMatchObject({ ok: false, status: 400 });
  expect(store.write('zzzzzzzzzzz', labeled())).toMatchObject({ ok: false, status: 400 }); // body says abcdefghijk
  const overlap = sampleGold({
    spans: [
      { start: 2, end: 5, root: 'A', quality: 'min', label: 'A:min', flag: 'guess', source: 'manual' },
      { start: 4, end: 6, root: 'F', quality: 'maj', label: 'F:maj', flag: 'guess', source: 'manual' },
    ],
  });
  expect(store.write('abcdefghijk', overlap)).toMatchObject({ ok: false, status: 400 });
  expect(fs.existsSync(path.join(dir, 'annotations'))).toBe(false);
});

test('list and read', () => {
  expect(store.list()).toEqual([]);
  store.write('abcdefghijk', labeled());
  expect(store.list()).toEqual([
    { videoId: 'abcdefghijk', title: 'Sample Song', updatedAt: '2026-09-24T00:00:00.000Z', labeledSeconds: 2 },
  ]);
  expect(JSON.parse(store.read('abcdefghijk')!).videoId).toBe('abcdefghijk');
  expect(store.read('nopenopenop')).toBeNull();
  expect(store.read('../../x')).toBeNull();
});

test('HTTP: PUT then GET round-trip; unknown id is 404; wrong method is 405', async () => {
  const base = await serve();
  const put = await fetch(`${base}/abcdefghijk`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(labeled()),
  });
  expect(put.status).toBe(200);
  expect(await put.json()).toEqual({ ok: true });
  const list = await (await fetch(`${base}/`)).json();
  expect(list).toHaveLength(1);
  const one = await fetch(`${base}/abcdefghijk`);
  expect((await one.json()).spans).toHaveLength(1);
  expect((await fetch(`${base}/nopenopenop`)).status).toBe(404);
  expect((await fetch(`${base}/abcdefghijk`, { method: 'DELETE' })).status).toBe(405);
});

test('HTTP: rejects non-JSON content types, bad JSON, traversal ids', async () => {
  const base = await serve();
  const text = await fetch(`${base}/abcdefghijk`, {
    method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(labeled()),
  });
  expect(text.status).toBe(415);
  const junk = await fetch(`${base}/abcdefghijk`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{not json',
  });
  expect(junk.status).toBe(400);
  const trav = await fetch(`${base}/..%2f..%2fpackage.json`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(labeled()),
  });
  expect(trav.status).toBe(400);
  expect((await fetch(`${base}/..%2f..%2fpackage.json`)).status).toBe(404);
});

test('HTTP: a body over the cap gets a 413, not a silent drop (Review Focus 5)', async () => {
  const base = await serve();
  const res = await fetch(`${base}/abcdefghijk`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: 'a'.repeat(MAX_BODY_BYTES + 10),
  });
  expect(res.status).toBe(413);
  expect(fs.existsSync(path.join(dir, 'annotations'))).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run tools/gold-plugin.test.ts`
Expected: FAIL — cannot resolve `./gold-plugin.ts`.

- [ ] **Step 3: Write the implementation**

Create `web/tools/gold-plugin.ts`:

```ts
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
import { labeledSeconds, toLab } from '../src/lib/gold/lab.ts';
import { VIDEO_ID_RE, type GoldFile, type GoldSummary } from '../src/lib/gold/types.ts';
import { validateGold } from '../src/lib/gold/validate.ts';

export const MAX_BODY_BYTES = 2 * 1024 * 1024;

export type WriteResult = { ok: true } | { ok: false; status: number; error: string };

/** Stable key order (and no unknown keys) so saved JSON diffs cleanly in git. */
function canonical(f: GoldFile): GoldFile {
  return {
    schemaVersion: f.schemaVersion,
    videoId: f.videoId,
    title: f.title,
    url: f.url,
    duration: f.duration,
    key: { tonic: f.key.tonic, mode: f.key.mode, source: f.key.source },
    grid: {
      factor: f.grid.factor, nudgeSec: f.grid.nudgeSec,
      beatsPerBar: f.grid.beatsPerBar, downbeatBeat: f.grid.downbeatBeat,
    },
    beats: f.beats,
    engine: {
      version: f.engine.version,
      chords: f.engine.chords.map((c) => ({
        start: c.start, end: c.end, root: c.root, quality: c.quality, label: c.label, confidence: c.confidence,
      })),
    },
    blind: f.blind,
    spans: f.spans.map((s) => ({
      start: s.start, end: s.end, root: s.root, quality: s.quality, label: s.label, flag: s.flag, source: s.source,
    })),
    updatedAt: f.updatedAt,
  };
}

export function createGoldStore(dir: string) {
  const atomicWrite = (target: string, text: string) => {
    const tmp = `${target}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, target);
  };
  return {
    list(): GoldSummary[] {
      if (!fs.existsSync(dir)) return [];
      const out: GoldSummary[] = [];
      for (const name of fs.readdirSync(dir)) {
        const m = /^([A-Za-z0-9_-]{11})\.json$/.exec(name);
        if (!m) continue;
        try {
          const f = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as GoldFile;
          out.push({ videoId: m[1], title: f.title, updatedAt: f.updatedAt, labeledSeconds: labeledSeconds(f.spans) });
        } catch {
          // skip an unreadable or hand-broken file rather than failing the whole list
        }
      }
      return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    read(id: string): string | null {
      if (!VIDEO_ID_RE.test(id)) return null;
      try {
        return fs.readFileSync(path.join(dir, `${id}.json`), 'utf8');
      } catch {
        return null;
      }
    },
    write(id: string, body: unknown): WriteResult {
      if (!VIDEO_ID_RE.test(id)) return { ok: false, status: 400, error: 'invalid video id' };
      const v = validateGold(body, id);
      if (!v.ok) return { ok: false, status: 400, error: v.error };
      const file = canonical(v.file);
      fs.mkdirSync(dir, { recursive: true });
      // .lab files first, JSON (the source of truth) last
      atomicWrite(path.join(dir, `${id}.lab`), toLab(file, 'labeled'));
      atomicWrite(path.join(dir, `${id}.sure.lab`), toLab(file, 'sure'));
      atomicWrite(path.join(dir, `${id}.json`), JSON.stringify(file, null, 2) + '\n');
      return { ok: true };
    },
  };
}
export type GoldStore = ReturnType<typeof createGoldStore>;

export function goldHandler(store: GoldStore) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    };
    const id = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/^\/+/, '');

    if (req.method === 'GET') {
      if (id === '') return send(200, store.list());
      const text = store.read(id);
      if (text === null) return send(404, { error: 'not found' });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return void res.end(text);
    }

    if (req.method === 'PUT' && id !== '') {
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
        return send(415, { error: 'expected application/json' });
      }
      const chunks: Buffer[] = [];
      let size = 0;
      let tooBig = false;
      req.on('data', (chunk: Buffer) => {
        if (tooBig) return;
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          tooBig = true;
          send(413, { error: 'body too large' });
          req.resume(); // drain the rest so the connection stays healthy
        } else {
          chunks.push(chunk);
        }
      });
      req.on('end', () => {
        if (tooBig) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          return send(400, { error: 'invalid JSON' });
        }
        const r = store.write(id, parsed);
        if (r.ok) send(200, { ok: true });
        else send(r.status, { error: r.error });
      });
      return;
    }

    send(405, { error: 'method not allowed' });
  };
}

/** Dev-server-only: exists under `vite dev`, never in a production build. */
export function goldPlugin(dir: string): Plugin {
  const handler = goldHandler(createGoldStore(dir));
  return {
    name: 'tabit-gold',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__gold', handler);
    },
  };
}
```

Modify `web/vite.config.ts` — replace the whole file with:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { goldPlugin } from './tools/gold-plugin.ts';

export default defineConfig({
  plugins: [
    react(),
    // dev-server-only middleware that saves annotator labels into the repo
    goldPlugin(fileURLToPath(new URL('../benchmarks/gold/annotations', import.meta.url))),
  ],
  server: { proxy: { '/api': { target: 'http://localhost:28224', rewrite: (p) => p.replace(/^\/api/, '') } } },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test-setup.ts' },
});
```

Modify `web/tsconfig.node.json`: change `"include": ["vite.config.ts"]` to:

```json
  "include": ["vite.config.ts", "tools"]
```

- [ ] **Step 4: Run to verify it passes, and that the whole web project still typechecks**

Run: `cd web && npx vitest run tools/gold-plugin.test.ts`
Expected: PASS (6 tests).
Run: `npx tsc -b`
Expected: no errors (this typechecks `tools/` under the node config, including `lab-contract.test.ts`).
Run: `npx vitest run`
Expected: the whole existing suite still passes.

- [ ] **Step 5: Commit**

```bash
git add web/tools/gold-plugin.ts web/tools/gold-plugin.test.ts web/vite.config.ts web/tsconfig.node.json
git commit -m "feat(gold): dev-only Vite middleware that saves annotations into the repo" \
           -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Player controls

**Files:**
- Modify: `web/src/playback/YouTubePlayer.tsx` (replace the file)
- Test: `web/src/playback/YouTubePlayer.test.tsx`

**Interfaces:**
- Consumes: `PlaybackSource` from `web/src/playback/usePlaybackTime.ts` (`{getCurrentTime(): number}`).
- Produces: `PlayerControls extends PlaybackSource { seekTo(sec): void; play(): void; pause(): void; setPlaybackRate(rate): void; getPlaybackRate(): number; isPlaying(): boolean }`; `YouTubePlayer` props `{ videoId; onReady(controls: PlayerControls); onError?(code: number); width?: number (default 300) }`. Backward compatible: `Sheet` passes `onReady={setSource}` unchanged.

- [ ] **Step 1: Write the failing test**

Create `web/src/playback/YouTubePlayer.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import YouTubePlayer, { type PlayerControls } from './YouTubePlayer';

interface Captured {
  events?: {
    onReady?: (e: { target: unknown }) => void;
    onError?: (e: { data: number }) => void;
  };
}

test('exposes seek/play/pause/rate controls, reports embed errors, honors width', async () => {
  const target = {
    getCurrentTime: vi.fn(() => 12.5), seekTo: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(),
    setPlaybackRate: vi.fn(), getPlaybackRate: vi.fn(() => 0.5), getPlayerState: vi.fn(() => 1),
    destroy: vi.fn(),
  };
  const captured: Captured = {};
  class FakePlayer {
    constructor(_el: HTMLElement, opts: Captured) {
      Object.assign(captured, opts);
    }
  }
  window.YT = { Player: FakePlayer as never };

  const box: { c?: PlayerControls } = {};
  const onError = vi.fn();
  const { container } = render(
    <YouTubePlayer videoId="abc" width={420} onReady={(c) => { box.c = c; }} onError={onError} />,
  );
  await vi.waitFor(() => expect(captured.events?.onReady).toBeDefined());
  captured.events!.onReady!({ target });

  expect(box.c!.getCurrentTime()).toBe(12.5);
  box.c!.seekTo(7);
  expect(target.seekTo).toHaveBeenCalledWith(7, true);
  box.c!.play();
  box.c!.pause();
  expect(target.playVideo).toHaveBeenCalled();
  expect(target.pauseVideo).toHaveBeenCalled();
  box.c!.setPlaybackRate(0.5);
  expect(target.setPlaybackRate).toHaveBeenCalledWith(0.5);
  expect(box.c!.getPlaybackRate()).toBe(0.5);
  expect(box.c!.isPlaying()).toBe(true);
  target.getPlayerState.mockReturnValue(2);
  expect(box.c!.isPlaying()).toBe(false);

  captured.events!.onError!({ data: 101 });
  expect(onError).toHaveBeenCalledWith(101);
  expect(container.firstElementChild).toHaveStyle({ width: '420px' });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/playback/YouTubePlayer.test.tsx`
Expected: FAIL — `box.c.seekTo is not a function` (the current player only exposes `getCurrentTime`) or `onError` never called.

- [ ] **Step 3: Write the implementation**

Replace `web/src/playback/YouTubePlayer.tsx` with:

```tsx
import { useEffect, useRef } from 'react';
import type { PlaybackSource } from './usePlaybackTime';

interface YTPlayerInstance {
  getCurrentTime(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getPlayerState(): number;
  destroy(): void;
}

interface YTPlayerOptions {
  videoId: string;
  playerVars?: Record<string, number>;
  events?: {
    onReady?: (event: { target: YTPlayerInstance }) => void;
    onError?: (event: { data: number }) => void;
  };
}

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Module-level so the `<script>` tag and API-ready callback are only ever
// installed once for the whole app, no matter how many players mount.
let apiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return apiPromise;
}

/** PlaybackSource plus the transport the annotator needs. Sheet only uses getCurrentTime. */
export interface PlayerControls extends PlaybackSource {
  seekTo(seconds: number): void;
  play(): void;
  pause(): void;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  isPlaying(): boolean;
}

export interface YouTubePlayerProps {
  videoId: string;
  onReady: (controls: PlayerControls) => void;
  /** YouTube error code, e.g. 101/150 = embedding disabled for this video */
  onError?: (code: number) => void;
  width?: number;
}

export default function YouTubePlayer({ videoId, onReady, onError, width = 300 }: YouTubePlayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let player: YTPlayerInstance | null = null;

    loadYouTubeApi().then(() => {
      if (cancelled || !mountRef.current || !window.YT) return;
      player = new window.YT.Player(mountRef.current, {
        videoId,
        playerVars: { modestbranding: 1, rel: 0 },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            const target = event.target;
            onReadyRef.current({
              getCurrentTime: () => target.getCurrentTime(),
              seekTo: (seconds) => target.seekTo(seconds, true),
              play: () => target.playVideo(),
              pause: () => target.pauseVideo(),
              setPlaybackRate: (rate) => target.setPlaybackRate(rate),
              getPlaybackRate: () => target.getPlaybackRate(),
              isPlaying: () => target.getPlayerState() === 1,
            });
          },
          onError: (event) => {
            if (!cancelled) onErrorRef.current?.(event.data);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (player) {
        try {
          player.destroy();
        } catch {
          // player may already be torn down by the API itself; ignore
        }
      }
    };
  }, [videoId]);

  return (
    <div
      style={{
        flex: 'none',
        width,
        background: '#000',
        borderRadius: 3,
        overflow: 'hidden',
        boxShadow: '0 6px 18px oklch(0.28 0.02 70 / 0.18)',
      }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
        <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes, and that Sheet still works**

Run: `cd web && npx vitest run src/playback/YouTubePlayer.test.tsx src/screens/Sheet.test.tsx && npx tsc -b`
Expected: PASS; no type errors (`Sheet`'s `onReady={setSource}` still type-checks).

- [ ] **Step 5: Commit**

```bash
git add web/src/playback/YouTubePlayer.tsx web/src/playback/YouTubePlayer.test.tsx
git commit -m "feat(player): expose seek/play/pause/rate controls, width and error events" \
           -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: New-file builder, client API, reducer, and keymap

**Files:**
- Create: `web/src/lib/gold/file.ts`, `web/src/annotate/goldApi.ts`, `web/src/annotate/annotatorReducer.ts`, `web/src/annotate/keymap.ts`
- Test: `web/src/lib/gold/file.test.ts`, `web/src/annotate/goldApi.test.ts`, `web/src/annotate/annotatorReducer.test.ts`, `web/src/annotate/keymap.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4 exports; `Chart` from `web/src/lib/types.ts`.
- Produces:
  - `newGoldFromChart(chart: Chart, url: string): GoldFile` — throws `Error('Annotate needs a YouTube URL …')` when `chart.source.videoId` is missing.
  - `goldApi.ts`: `listGold(): Promise<GoldSummary[]>`; `loadGold(id): Promise<{file: GoldFile; needsSave: boolean} | null>`; `saveGold(file): Promise<void>` (on any failure writes a `localStorage` draft under `tabit:gold-draft:<id>` and rethrows); `readDraft(id)`, `clearDraft(id)`.
  - `annotatorReducer.ts`: `AnnotatorState {file, cursor, flatPending, past, future}`; `Action` union (`digit`, `flatPrefix`, `toggle`, `mark`, `confirm`, `clear`, `undo`, `redo`, `setCursor`, `moveCursor`, `moveRow`, `setBeatsPerBar`, `setDownbeat`, `setKey`); `UNDO_LIMIT = 200`; `initState(file)`; `reduce(state, action)`.
  - `keymap.ts`: `UiAction = Action | {type:'playPause'}`; `keyToAction(e: KeyLike): UiAction | null`; `isTypingTarget(target): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `web/src/lib/gold/file.test.ts`:

```ts
import { expect, test } from 'vitest';
import type { Chart } from '../types';
import { newGoldFromChart } from './file.ts';

const chart = (over: Partial<Chart> = {}): Chart => ({
  schemaVersion: 1,
  source: { kind: 'youtube', videoId: 'vjr9Madg_sI', title: 'Write Me A Letter', duration: 195 },
  analysis: { engineVersion: '0.2.1', createdAt: 'now' },
  key: { tonic: 'C', mode: 'major', confidence: 0.89 },
  scales: [], tempo: { bpm: 129 },
  beats: [0.1, 0.6, 1.1, 1.6, 2.1, 2.6, 3.1, 3.6], sections: [],
  chords: [{ start: 0.1, end: 2.1, label: 'Am7/E', root: 'A', quality: 'min7', bass: 'E', confidence: 0.4 }],
  meter: { beatsPerBar: 4, confidence: 0.16 },
  downbeats: [1.1],
  ...over,
});

test('builds a fresh GoldFile from a chart', () => {
  const f = newGoldFromChart(chart(), 'https://www.youtube.com/watch?v=vjr9Madg_sI');
  expect(f).toMatchObject({
    schemaVersion: 1, videoId: 'vjr9Madg_sI', title: 'Write Me A Letter', duration: 195, blind: false, spans: [],
    key: { tonic: 'C', mode: 'major', source: 'engine' },
    grid: { factor: 1, nudgeSec: 0, beatsPerBar: 4, downbeatBeat: 2 },
    engine: { version: '0.2.1' },
  });
  expect(f.engine.chords[0]).toEqual({ start: 0.1, end: 2.1, root: 'A', quality: 'min7', label: 'Am7/E', confidence: 0.4 });
  expect(f.beats).toEqual(chart().beats);
});

test('the engine downbeat seeds the grid phase, reduced modulo beats-per-bar; missing downbeats default to 0', () => {
  expect(newGoldFromChart(chart({ downbeats: [3.1] }), 'u').grid.downbeatBeat).toBe(2); // beat 6 % 4
  expect(newGoldFromChart(chart({ downbeats: undefined }), 'u').grid.downbeatBeat).toBe(0);
  expect(newGoldFromChart(chart({ meter: undefined }), 'u').grid.beatsPerBar).toBe(4);
});

test('normalizes a flat tonic and maps an unknown mode to major', () => {
  const f = newGoldFromChart(chart({ key: { tonic: 'Bb', mode: 'dorian', confidence: 0.5 } }), 'u');
  expect(f.key).toEqual({ tonic: 'A#', mode: 'major', source: 'engine' });
});

test('refuses a chart with no videoId (Review Focus 2)', () => {
  const c = chart({ source: { kind: 'file', videoId: null, title: 'x.wav', duration: 10 } });
  expect(() => newGoldFromChart(c, 'u')).toThrow(/YouTube URL/);
});
```

Create `web/src/annotate/goldApi.test.ts`:

```ts
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { sampleGold } from '../lib/gold/sample.ts';
import { clearDraft, listGold, loadGold, readDraft, saveGold } from './goldApi.ts';

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

test('saveGold PUTs JSON and clears any draft on success', async () => {
  const fetchMock = vi.fn(() => Promise.resolve(ok({ ok: true })));
  vi.stubGlobal('fetch', fetchMock);
  const file = sampleGold();
  localStorage.setItem(`tabit:gold-draft:${file.videoId}`, JSON.stringify(file));
  await saveGold(file);
  expect(fetchMock).toHaveBeenCalledWith('/__gold/abcdefghijk', expect.objectContaining({ method: 'PUT' }));
  expect(readDraft(file.videoId)).toBeNull();
});

test('a failed save keeps a draft and rethrows; a network error does too (Review Focus 3)', async () => {
  const file = sampleGold();
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(ok({ error: 'boom' }, 500))));
  await expect(saveGold(file)).rejects.toThrow(/500/);
  expect(readDraft(file.videoId)?.videoId).toBe(file.videoId);
  clearDraft(file.videoId);
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
  await expect(saveGold(file)).rejects.toThrow();
  expect(readDraft(file.videoId)).not.toBeNull();
});

test('loadGold: 404 with no draft → null; a newer draft beats the server file and asks to re-save', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(ok({ error: 'not found' }, 404))));
  expect(await loadGold('abcdefghijk')).toBeNull();

  const server = sampleGold({ updatedAt: '2026-09-24T00:00:00.000Z' });
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(ok(server))));
  expect(await loadGold('abcdefghijk')).toEqual({ file: server, needsSave: false });

  const draft = sampleGold({ updatedAt: '2026-09-24T01:00:00.000Z', title: 'newer draft' });
  localStorage.setItem('tabit:gold-draft:abcdefghijk', JSON.stringify(draft));
  expect(await loadGold('abcdefghijk')).toEqual({ file: draft, needsSave: true });

  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(ok({ error: 'not found' }, 404))));
  expect((await loadGold('abcdefghijk'))?.needsSave).toBe(true); // draft with no server file
});

test('listGold returns the server list', async () => {
  const rows = [{ videoId: 'abcdefghijk', title: 'T', updatedAt: 'x', labeledSeconds: 3 }];
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(ok(rows))));
  expect(await listGold()).toEqual(rows);
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(ok({}, 500))));
  await expect(listGold()).rejects.toThrow();
});
```

Create `web/src/annotate/keymap.test.ts`:

```ts
import { expect, test } from 'vitest';
import { isTypingTarget, keyToAction, type KeyLike } from './keymap.ts';

const k = (key: string, extra: Partial<KeyLike> = {}): KeyLike =>
  ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, repeat: false, ...extra });

test('digits, flat prefix, quality toggles, marks', () => {
  expect(keyToAction(k('6'))).toEqual({ type: 'digit', digit: 6 });
  expect(keyToAction(k('8'))).toBeNull();
  expect(keyToAction(k('0'))).toBeNull();
  expect(keyToAction(k('b'))).toEqual({ type: 'flatPrefix' });
  expect(keyToAction(k('m'))).toEqual({ type: 'toggle', which: 'm' });
  expect(keyToAction(k('d'))).toEqual({ type: 'toggle', which: 'd' });
  expect(keyToAction(k('j'))).toEqual({ type: 'toggle', which: 'j' });
  expect(keyToAction(k('n'))).toEqual({ type: 'mark', kind: 'N' });
  expect(keyToAction(k('x'))).toEqual({ type: 'mark', kind: 'X' });
});

test('confirm, clear, movement, play/pause', () => {
  expect(keyToAction(k('Enter'))).toEqual({ type: 'confirm' });
  expect(keyToAction(k('Backspace'))).toEqual({ type: 'clear' });
  expect(keyToAction(k('ArrowLeft'))).toEqual({ type: 'moveCursor', delta: -1 });
  expect(keyToAction(k('ArrowRight'))).toEqual({ type: 'moveCursor', delta: 1 });
  expect(keyToAction(k('ArrowUp'))).toEqual({ type: 'moveRow', dir: -1 });
  expect(keyToAction(k('ArrowDown'))).toEqual({ type: 'moveRow', dir: 1 });
  expect(keyToAction(k(' '))).toEqual({ type: 'playPause' });
});

test('undo/redo via ⌘/Ctrl+Z; other modified keys are ignored', () => {
  expect(keyToAction(k('z', { metaKey: true }))).toEqual({ type: 'undo' });
  expect(keyToAction(k('z', { ctrlKey: true }))).toEqual({ type: 'undo' });
  expect(keyToAction(k('z', { metaKey: true, shiftKey: true }))).toEqual({ type: 'redo' });
  expect(keyToAction(k('6', { metaKey: true }))).toBeNull(); // ⌘6 is a browser shortcut
  expect(keyToAction(k('6', { altKey: true }))).toBeNull();
});

test('auto-repeat never re-fires chord entry, but arrows may repeat (Review Focus 4)', () => {
  expect(keyToAction(k('6', { repeat: true }))).toBeNull();
  expect(keyToAction(k('Enter', { repeat: true }))).toBeNull();
  expect(keyToAction(k('m', { repeat: true }))).toBeNull();
  expect(keyToAction(k('ArrowRight', { repeat: true }))).toEqual({ type: 'moveCursor', delta: 1 });
});

test('isTypingTarget: inputs, selects and textareas swallow keys; body and buttons do not (Review Focus 4)', () => {
  const el = (tag: string) => document.createElement(tag);
  expect(isTypingTarget(el('input'))).toBe(true);
  expect(isTypingTarget(el('select'))).toBe(true);
  expect(isTypingTarget(el('textarea'))).toBe(true);
  expect(isTypingTarget(el('button'))).toBe(false);
  expect(isTypingTarget(document.body)).toBe(false);
  expect(isTypingTarget(null)).toBe(false);
});
```

Create `web/src/annotate/annotatorReducer.test.ts`:

```ts
import { expect, test } from 'vitest';
import { sampleGold } from '../lib/gold/sample.ts';
import type { GoldFile } from '../lib/gold/types.ts';
import { initState, reduce, UNDO_LIMIT, type Action, type AnnotatorState } from './annotatorReducer.ts';

// sampleGold: 24 beats at 0.5 s, 4 beats/bar, C major; engine chords Am 0–4, F 4–8, C 8–12.
const run = (state: AnnotatorState, ...actions: Action[]) => actions.reduce(reduce, state);
const start = (over: Partial<GoldFile> = {}) => initState(sampleGold(over));
const labels = (s: AnnotatorState) => s.file.spans.map((x) => `${x.start}-${x.end} ${x.label} ${x.source}`);

test('digit on a ghost start confirms when it matches the engine, edits when it does not', () => {
  const same = run(start(), { type: 'digit', digit: 6 }); // Am at t=0 = engine's Am
  expect(labels(same)).toEqual(['0-4 A:min confirmed']);
  const diff = run(start(), { type: 'digit', digit: 5 }); // G over the Am ghost
  expect(labels(diff)).toEqual(['0-4 G:maj edited']);
});

test('digit mid-ghost splits; the cursor stays put', () => {
  const s = run(start(), { type: 'setCursor', beat: 2 }, { type: 'digit', digit: 4 }); // t = 1.0
  expect(labels(s)).toEqual(['1-4 F:maj edited']);
  expect(s.cursor).toBe(2);
});

test('flat prefix applies to exactly one digit', () => {
  const s = run(start(), { type: 'flatPrefix' }, { type: 'digit', digit: 7 });
  expect(labels(s)).toEqual(['0-4 A#:maj edited']);
  expect(s.flatPending).toBe(false);
  const t = run(s, { type: 'setCursor', beat: 8 }, { type: 'digit', digit: 7 }); // no prefix now
  expect(labels(t)[1]).toBe('4-8 B:min edited');
});

test('toggle retones the chord under the cursor; mark places N and X', () => {
  const s = run(start(), { type: 'toggle', which: 'd' }); // Am ghost → Am7
  expect(labels(s)).toEqual(['0-4 A:min7 edited']);
  const n = run(start(), { type: 'mark', kind: 'N' });
  expect(labels(n)).toEqual(['0-4 N edited']);
  const x = run(start(), { type: 'mark', kind: 'X' });
  expect(x.file.spans[0]).toMatchObject({ label: 'X', flag: 'skip' });
});

test('Enter confirms the ghost and advances to the next chip; on an existing span it just advances', () => {
  const s = run(start(), { type: 'confirm' });
  expect(labels(s)).toEqual(['0-4 A:min confirmed']);
  expect(s.cursor).toBe(8); // t = 4.0 → beat 8
  const t = run(s, { type: 'confirm' });
  expect(labels(t)).toEqual(['0-4 A:min confirmed', '4-8 F:maj confirmed']);
  const back = run(t, { type: 'setCursor', beat: 0 }, { type: 'confirm' }); // already labeled
  expect(back.file.spans).toBe(t.file.spans);
  expect(back.cursor).toBe(8);
});

test('clear removes the span under the cursor', () => {
  const s = run(start(), { type: 'digit', digit: 6 }, { type: 'clear' });
  expect(s.file.spans).toEqual([]);
});

test('undo/redo restore spans; a new edit clears the redo stack; history is capped', () => {
  let s = run(start(), { type: 'digit', digit: 6 }, { type: 'setCursor', beat: 8 }, { type: 'digit', digit: 4 });
  expect(s.file.spans).toHaveLength(2);
  s = run(s, { type: 'undo' });
  expect(s.file.spans).toHaveLength(1);
  s = run(s, { type: 'redo' });
  expect(s.file.spans).toHaveLength(2);
  s = run(s, { type: 'undo' }, { type: 'undo' });
  expect(s.file.spans).toHaveLength(0);
  expect(run(s, { type: 'undo' })).toBe(s); // nothing left to undo
  s = run(s, { type: 'digit', digit: 6 });
  expect(s.future).toEqual([]);

  // history cap
  let big = start();
  for (let i = 0; i < UNDO_LIMIT + 20; i++) big = run(big, { type: 'digit', digit: i % 2 ? 6 : 5 });
  expect(big.past.length).toBeLessThanOrEqual(UNDO_LIMIT);
});

test('cursor movement clamps to the grid; rows are 4 bars', () => {
  let s = start();
  expect(run(s, { type: 'moveCursor', delta: -5 }).cursor).toBe(0);
  s = run(s, { type: 'moveCursor', delta: 3 });
  expect(s.cursor).toBe(3);
  expect(run(s, { type: 'moveRow', dir: 1 }).cursor).toBe(19); // +16
  expect(run(s, { type: 'setCursor', beat: 999 }).cursor).toBe(23);
});

test('grid controls: beats/bar and downbeat clamp and do not enter undo history', () => {
  let s = run(start(), { type: 'setBeatsPerBar', value: 3 }, { type: 'setDownbeat', value: 2 });
  expect(s.file.grid).toMatchObject({ beatsPerBar: 3, downbeatBeat: 2 });
  expect(run(s, { type: 'setBeatsPerBar', value: 99 }).file.grid.beatsPerBar).toBe(12);
  expect(run(s, { type: 'setDownbeat', value: -4 }).file.grid.downbeatBeat).toBe(0);
  expect(s.past).toEqual([]);
});

test('setKey: keep chords leaves labels alone; transpose shifts them; both mark the key as user-set', () => {
  const labeled = run(start(), { type: 'digit', digit: 6 }); // A:min
  const keep = run(labeled, { type: 'setKey', tonic: 'A', mode: 'minor', transpose: false });
  expect(keep.file.key).toEqual({ tonic: 'A', mode: 'minor', source: 'user' });
  expect(keep.file.spans[0].label).toBe('A:min');
  const moved = run(labeled, { type: 'setKey', tonic: 'D', mode: 'major', transpose: true }); // C → D = +2
  expect(moved.file.spans[0].label).toBe('B:min');
  expect(moved.past).toHaveLength(2); // the transpose is undoable
});

test('no beats: editing actions are no-ops instead of crashing (Review Focus 1)', () => {
  const s = start({ beats: [] });
  expect(() => run(s, { type: 'digit', digit: 6 }, { type: 'confirm' }, { type: 'toggle', which: 'm' })).not.toThrow();
  expect(run(s, { type: 'digit', digit: 6 }).file.spans).toEqual([]);
  expect(run(s, { type: 'moveCursor', delta: 3 }).cursor).toBe(0);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run src/lib/gold/file.test.ts src/annotate/goldApi.test.ts src/annotate/keymap.test.ts src/annotate/annotatorReducer.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

Create `web/src/lib/gold/file.ts`:

```ts
import type { Chart } from '../types';
import { nameOf, pcOf } from './degrees.ts';
import type { GoldFile } from './types.ts';

/** Snapshot the engine's chart into a fresh, unlabeled GoldFile. */
export function newGoldFromChart(chart: Chart, url: string): GoldFile {
  const videoId = chart.source.videoId;
  if (!videoId) {
    throw new Error('Annotate needs a YouTube URL — uploaded files have no video ID to save under.');
  }
  const beatsPerBar = chart.meter?.beatsPerBar ?? 4;
  const firstDown = chart.downbeats?.[0];
  const idx = firstDown === undefined ? -1 : chart.beats.findIndex((b) => Math.abs(b - firstDown) < 0.02);
  return {
    schemaVersion: 1,
    videoId,
    title: chart.source.title ?? videoId,
    url,
    duration: chart.source.duration,
    key: {
      tonic: nameOf(pcOf(chart.key.tonic)),
      mode: chart.key.mode === 'minor' ? 'minor' : 'major',
      source: 'engine',
    },
    grid: { factor: 1, nudgeSec: 0, beatsPerBar, downbeatBeat: idx >= 0 ? idx % beatsPerBar : 0 },
    beats: chart.beats,
    engine: {
      version: chart.analysis.engineVersion,
      chords: chart.chords.map((c) => ({
        start: c.start, end: c.end, root: c.root, quality: c.quality, label: c.label, confidence: c.confidence,
      })),
    },
    blind: false,
    spans: [],
    updatedAt: new Date().toISOString(),
  };
}
```

Create `web/src/annotate/goldApi.ts`:

```ts
import type { GoldFile, GoldSummary } from '../lib/gold/types.ts';

const draftKey = (id: string) => `tabit:gold-draft:${id}`;

export function readDraft(id: string): GoldFile | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as GoldFile) : null;
  } catch {
    return null;
  }
}

function writeDraft(file: GoldFile): void {
  try {
    localStorage.setItem(draftKey(file.videoId), JSON.stringify(file));
  } catch {
    // storage full or blocked: the on-disk save is still the primary path
  }
}

export function clearDraft(id: string): void {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    // ignore
  }
}

export async function listGold(): Promise<GoldSummary[]> {
  const res = await fetch('/__gold');
  if (!res.ok) throw new Error(`gold list failed: ${res.status}`);
  return (await res.json()) as GoldSummary[];
}

/** Load a song's labels. A localStorage draft newer than the on-disk file wins and asks to be re-saved. */
export async function loadGold(id: string): Promise<{ file: GoldFile; needsSave: boolean } | null> {
  const res = await fetch(`/__gold/${id}`);
  let server: GoldFile | null = null;
  if (res.ok) server = (await res.json()) as GoldFile;
  else if (res.status !== 404) throw new Error(`gold load failed: ${res.status}`);
  const draft = readDraft(id);
  if (draft && (!server || draft.updatedAt > server.updatedAt)) return { file: draft, needsSave: true };
  return server ? { file: server, needsSave: false } : null;
}

/** PUT the file. On any failure keep a draft so no labeling is lost, and rethrow. */
export async function saveGold(file: GoldFile): Promise<void> {
  try {
    const res = await fetch(`/__gold/${file.videoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(file),
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
    clearDraft(file.videoId);
  } catch (e) {
    writeDraft(file);
    throw e;
  }
}
```

Create `web/src/annotate/annotatorReducer.ts`:

```ts
import { chordForDigit, nameOf, pcOf, type QualityToggle } from '../lib/gold/degrees.ts';
import { barEndBeat, effectiveBeats, firstBeatAtOrAfter, meanInterval } from '../lib/gold/grid.ts';
import {
  MAX_AUTO_EXTEND_BARS, clearAt, computeGhosts, confirmGhost, placeChord, retoneAt, spanAt,
  transposeSpans, type PlaceBase,
} from '../lib/gold/spans.ts';
import type { GoldFile, GoldSpan, Mode } from '../lib/gold/types.ts';

export const UNDO_LIMIT = 200;

export interface AnnotatorState {
  file: GoldFile;
  /** index into the effective beat grid */
  cursor: number;
  /** the `b` prefix was pressed and applies to the next digit */
  flatPending: boolean;
  past: GoldSpan[][];
  future: GoldSpan[][];
}

export type Action =
  | { type: 'digit'; digit: number }
  | { type: 'flatPrefix' }
  | { type: 'toggle'; which: QualityToggle }
  | { type: 'mark'; kind: 'N' | 'X' }
  | { type: 'confirm' }
  | { type: 'clear' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'setCursor'; beat: number }
  | { type: 'moveCursor'; delta: number }
  | { type: 'moveRow'; dir: 1 | -1 }
  | { type: 'setBeatsPerBar'; value: number }
  | { type: 'setDownbeat'; value: number }
  | { type: 'setKey'; tonic: string; mode: Mode; transpose: boolean };

export function initState(file: GoldFile): AnnotatorState {
  return { file, cursor: 0, flatPending: false, past: [], future: [] };
}

const now = () => new Date().toISOString();
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function context(file: GoldFile, cursor: number) {
  const beats = effectiveBeats(file.beats, file.grid);
  const mean = meanInterval(beats);
  const ghosts = computeGhosts(file.engine.chords, file.spans, file.blind);
  const { beatsPerBar, downbeatBeat } = file.grid;
  const endBeat = barEndBeat(cursor, beatsPerBar, downbeatBeat);
  const base: PlaceBase = {
    barEnd: endBeat < beats.length ? beats[endBeat] : file.duration,
    duration: file.duration,
    tol: 0.45 * mean,
    autoExtendMax: MAX_AUTO_EXTEND_BARS * beatsPerBar * mean,
  };
  return { beats, ghosts, base, t: beats[cursor] as number | undefined };
}

/** Apply new spans, recording history only when they actually changed. */
function commit(state: AnnotatorState, spans: GoldSpan[], extra: Partial<AnnotatorState> = {}): AnnotatorState {
  if (spans === state.file.spans) return { ...state, ...extra, flatPending: false };
  return {
    ...state,
    ...extra,
    flatPending: false,
    file: { ...state.file, spans, updatedAt: now() },
    past: [...state.past, state.file.spans].slice(-UNDO_LIMIT),
    future: [],
  };
}

export function reduce(state: AnnotatorState, a: Action): AnnotatorState {
  const { file, cursor } = state;

  switch (a.type) {
    case 'flatPrefix':
      return { ...state, flatPending: true };

    case 'setCursor':
    case 'moveCursor':
    case 'moveRow': {
      const last = Math.max(0, effectiveBeats(file.beats, file.grid).length - 1);
      const target =
        a.type === 'setCursor' ? a.beat
        : a.type === 'moveCursor' ? cursor + a.delta
        : cursor + a.dir * file.grid.beatsPerBar * 4;
      return { ...state, cursor: clamp(target, 0, last), flatPending: false };
    }

    case 'setBeatsPerBar':
      return { ...state, file: { ...file, grid: { ...file.grid, beatsPerBar: clamp(Math.round(a.value), 1, 12) }, updatedAt: now() } };

    case 'setDownbeat':
      return { ...state, file: { ...file, grid: { ...file.grid, downbeatBeat: Math.max(0, Math.round(a.value)) }, updatedAt: now() } };

    case 'setKey': {
      const delta = pcOf(a.tonic) - pcOf(file.key.tonic);
      const spans = a.transpose ? transposeSpans(file.spans, delta) : file.spans;
      const next: GoldFile = {
        ...file,
        key: { tonic: nameOf(pcOf(a.tonic)), mode: a.mode, source: 'user' },
        spans,
        updatedAt: now(),
      };
      const changed = spans !== file.spans;
      return {
        ...state,
        file: next,
        flatPending: false,
        past: changed ? [...state.past, file.spans].slice(-UNDO_LIMIT) : state.past,
        future: changed ? [] : state.future,
      };
    }

    case 'undo': {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        ...state,
        file: { ...file, spans: prev, updatedAt: now() },
        past: state.past.slice(0, -1),
        future: [...state.future, file.spans],
        flatPending: false,
      };
    }

    case 'redo': {
      const next = state.future[state.future.length - 1];
      if (!next) return state;
      return {
        ...state,
        file: { ...file, spans: next, updatedAt: now() },
        past: [...state.past, file.spans].slice(-UNDO_LIMIT),
        future: state.future.slice(0, -1),
        flatPending: false,
      };
    }

    default:
      break;
  }

  // editing actions all need a cursor beat
  const c = context(file, cursor);
  if (c.t === undefined) return { ...state, flatPending: false };
  const t = c.t;

  switch (a.type) {
    case 'digit':
      return commit(state, placeChord(file.spans, c.ghosts, {
        ...c.base, t, chord: chordForDigit(file.key, a.digit, state.flatPending),
      }));

    case 'toggle':
      return commit(state, retoneAt(file.spans, c.ghosts, t, a.which, c.base));

    case 'mark':
      return commit(state, placeChord(file.spans, c.ghosts, {
        ...c.base, t,
        chord: a.kind === 'N' ? { root: 'N', quality: 'N' } : { root: null, quality: 'X' },
      }));

    case 'confirm': {
      const r = confirmGhost(file.spans, c.ghosts, t);
      if (r) {
        const next = clamp(firstBeatAtOrAfter(c.beats, r.next - c.base.tol), 0, c.beats.length - 1);
        return commit(state, r.spans, { cursor: next });
      }
      const s = spanAt(file.spans, t);
      if (s) {
        const next = clamp(firstBeatAtOrAfter(c.beats, s.end - c.base.tol), 0, c.beats.length - 1);
        return { ...state, cursor: next, flatPending: false };
      }
      return state;
    }

    case 'clear':
      return commit(state, clearAt(file.spans, t));

    default:
      return state;
  }
}
```

Create `web/src/annotate/keymap.ts`:

```ts
import type { QualityToggle } from '../lib/gold/degrees.ts';
import type { Action } from './annotatorReducer.ts';

export type UiAction = Action | { type: 'playPause' };

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  repeat: boolean;
}

/** Map a key event to an action. Held keys never re-fire chord entry; arrows may repeat. */
export function keyToAction(e: KeyLike): UiAction | null {
  if (e.altKey) return null;
  if (e.metaKey || e.ctrlKey) {
    if (e.key.toLowerCase() === 'z') return e.shiftKey ? { type: 'redo' } : { type: 'undo' };
    return null;
  }
  switch (e.key) {
    case 'ArrowLeft': return { type: 'moveCursor', delta: -1 };
    case 'ArrowRight': return { type: 'moveCursor', delta: 1 };
    case 'ArrowUp': return { type: 'moveRow', dir: -1 };
    case 'ArrowDown': return { type: 'moveRow', dir: 1 };
    default: break;
  }
  if (e.repeat) return null;
  if (/^[1-7]$/.test(e.key)) return { type: 'digit', digit: Number(e.key) };
  switch (e.key) {
    case 'b': return { type: 'flatPrefix' };
    case 'm':
    case 'd':
    case 'j': return { type: 'toggle', which: e.key as QualityToggle };
    case 'n': return { type: 'mark', kind: 'N' };
    case 'x': return { type: 'mark', kind: 'X' };
    case 'Enter': return { type: 'confirm' };
    case 'Backspace': return { type: 'clear' };
    case ' ': return { type: 'playPause' };
    default: return null;
  }
}

/** Keys typed into a form control must not enter chords. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable === true;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd web && npx vitest run src/lib/gold/file.test.ts src/annotate/goldApi.test.ts src/annotate/keymap.test.ts src/annotate/annotatorReducer.test.ts && npx tsc -b`
Expected: all PASS, no type errors. If the reducer's "history cap" test is slow (> 2 s), reduce the loop to `UNDO_LIMIT + 5` iterations; do not weaken the assertion.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/gold/file.ts web/src/lib/gold/file.test.ts web/src/annotate/goldApi.ts \
        web/src/annotate/goldApi.test.ts web/src/annotate/annotatorReducer.ts \
        web/src/annotate/annotatorReducer.test.ts web/src/annotate/keymap.ts web/src/annotate/keymap.test.ts
git commit -m "feat(annotate): new-file builder, gold client API with drafts, reducer with undo, keymap" \
           -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Editor UI, Annotate screen, and the dev-only route

**Files:**
- Create: `web/src/annotate/layout.ts`, `web/src/annotate/useAnnotator.ts`, `web/src/annotate/AnnotateSheet.tsx`, `web/src/annotate/TopBar.tsx`, `web/src/annotate/AnnotateEditor.tsx`, `web/src/annotate/Annotate.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/src/annotate/layout.test.ts`, `web/src/annotate/AnnotateEditor.test.tsx`, `web/src/annotate/Annotate.test.tsx`, `web/src/App.annotate.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–7; `usePlaybackTime`, `analyzeUrl`, `pollJob`, `Analyzing`, `beatIndexAt`.
- Produces: `layout.ts`: `Seg {key, kind: 'ghost'|'span', startBeat, endBeat, chord, flag?, source?}`, `buildSegments(file, beats, ghosts, tol): Seg[]`, `clipToRow(seg, row): {colStart, colEnd} | null`, `columnFromClick(x, left, width, cols): number`, `formatTime(sec): string`. `useAnnotator(initial, needsSave)` → `{state, dispatch, saveStatus}` with `SaveStatus = 'idle'|'saving'|'saved'|'error'` and `SAVE_DEBOUNCE_MS = 500`. `AnnotateEditor({file, needsSave, onBack})`. `Annotate()` (default export of `Annotate.tsx`, the `#annotate` screen).

- [ ] **Step 1: Write the failing tests**

Create `web/src/annotate/layout.test.ts`:

```ts
import { expect, test } from 'vitest';
import { sampleGold } from '../lib/gold/sample.ts';
import type { Ghost } from '../lib/gold/spans.ts';
import { buildSegments, clipToRow, columnFromClick, formatTime } from './layout.ts';

const beats = Array.from({ length: 24 }, (_, i) => i * 0.5);
const ghost = (start: number, end: number): Ghost => ({ start, end, chord: { root: 'A', quality: 'min' } });

test('buildSegments maps time ranges to beat ranges and always occupies at least one beat', () => {
  const file = sampleGold({
    spans: [{ start: 4, end: 8, root: 'F', quality: 'maj', label: 'F:maj', flag: 'guess', source: 'edited' }],
  });
  const segs = buildSegments(file, beats, [ghost(0, 4), ghost(8, 8.1)], 0.1);
  expect(segs.map((s) => [s.kind, s.startBeat, s.endBeat])).toEqual([
    ['ghost', 0, 8], ['ghost', 16, 17], ['span', 8, 16],
  ]);
  expect(segs.find((s) => s.kind === 'span')).toMatchObject({ flag: 'guess', source: 'edited' });
});

test('clipToRow clips a segment to the row and reports 1-based grid columns', () => {
  const row = { startBar: 0, startBeat: 0, cols: 16 };
  const seg = { key: 'k', kind: 'ghost' as const, startBeat: 12, endBeat: 20, chord: { root: 'A', quality: 'min' as const } };
  expect(clipToRow(seg, row)).toEqual({ colStart: 13, colEnd: 17 });
  expect(clipToRow(seg, { startBar: 4, startBeat: 16, cols: 16 })).toEqual({ colStart: 1, colEnd: 5 });
  expect(clipToRow(seg, { startBar: 8, startBeat: 32, cols: 16 })).toBeNull();
});

test('columnFromClick maps an x position to a column, clamped', () => {
  expect(columnFromClick(0, 0, 160, 16)).toBe(0);
  expect(columnFromClick(85, 0, 160, 16)).toBe(8);
  expect(columnFromClick(1000, 0, 160, 16)).toBe(15);
  expect(columnFromClick(-50, 0, 160, 16)).toBe(0);
  expect(columnFromClick(5, 0, 0, 16)).toBe(0); // zero-width (jsdom) is safe
});

test('formatTime', () => {
  expect(formatTime(0)).toBe('0:00');
  expect(formatTime(65.9)).toBe('1:05');
  expect(formatTime(-3)).toBe('0:00');
});
```

Create `web/src/annotate/AnnotateEditor.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { sampleGold } from '../lib/gold/sample.ts';
import AnnotateEditor from './AnnotateEditor.tsx';
import * as goldApi from './goldApi.ts';

vi.mock('../playback/YouTubePlayer', () => ({ default: () => <div data-testid="yt" /> }));
vi.mock('./goldApi.ts', () => ({ saveGold: vi.fn(() => Promise.resolve()) }));

const chips = (kind?: string) =>
  screen.queryAllByTestId('chip').filter((c) => !kind || c.getAttribute('data-kind') === kind);
const labels = (kind: string) => chips(kind).map((c) => c.getAttribute('data-label'));

beforeEach(() => vi.mocked(goldApi.saveGold).mockClear());

test('renders the engine chords as ghost chips on lead-sheet rows', () => {
  render(<AnnotateEditor file={sampleGold()} needsSave={false} onBack={() => {}} />);
  expect(screen.getAllByTestId('sheet-row')).toHaveLength(2); // 24 beats, 16 columns per row
  expect(labels('ghost')).toEqual(['A:min', 'F:maj', 'C:maj']);
  expect(chips('span')).toHaveLength(0);
});

test('a digit at the cursor confirms a matching ghost; arrows + digit split a ghost', async () => {
  const user = userEvent.setup();
  render(<AnnotateEditor file={sampleGold()} needsSave={false} onBack={() => {}} />);
  await user.keyboard('6'); // vi = Am at beat 0 = the engine's own chord
  expect(labels('span')).toEqual(['A:min']);
  expect(labels('ghost')).toEqual(['F:maj', 'C:maj']);

  await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
  await user.keyboard('5'); // beat 8 = the F ghost's first beat → G replaces it
  expect(labels('span')).toEqual(['A:min', 'G:maj']);
});

test('Enter confirms the ghost and advances; Backspace clears; ⌘Z undoes', async () => {
  const user = userEvent.setup();
  render(<AnnotateEditor file={sampleGold()} needsSave={false} onBack={() => {}} />);
  await user.keyboard('{Enter}{Enter}');
  expect(labels('span')).toEqual(['A:min', 'F:maj']);
  await user.keyboard('{Backspace}'); // cursor sits on the C ghost now: nothing to clear
  expect(labels('span')).toEqual(['A:min', 'F:maj']);
  await user.keyboard('{Meta>}z{/Meta}');
  expect(labels('span')).toEqual(['A:min']);
  await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}');
  expect(labels('span')).toEqual(['A:min', 'F:maj']);
});

test('keys typed into a select do not place chords (Review Focus 4)', async () => {
  const user = userEvent.setup();
  render(<AnnotateEditor file={sampleGold()} needsSave={false} onBack={() => {}} />);
  screen.getByLabelText(/beats per bar/i).focus();
  await user.keyboard('6');
  expect(chips('span')).toHaveLength(0);
});

test('autosaves once, debounced, with the labeled file; shows Saved', async () => {
  const user = userEvent.setup();
  render(<AnnotateEditor file={sampleGold()} needsSave={false} onBack={() => {}} />);
  expect(goldApi.saveGold).not.toHaveBeenCalled(); // an untouched file is never written
  await user.keyboard('6');
  await waitFor(() => expect(goldApi.saveGold).toHaveBeenCalledTimes(1), { timeout: 2000 });
  expect(vi.mocked(goldApi.saveGold).mock.calls[0][0].spans).toHaveLength(1);
  expect(await screen.findByText(/saved/i)).toBeInTheDocument();
});

test('a failed save shows the failure (Review Focus 3)', async () => {
  vi.mocked(goldApi.saveGold).mockRejectedValueOnce(new Error('offline'));
  const user = userEvent.setup();
  render(<AnnotateEditor file={sampleGold()} needsSave={false} onBack={() => {}} />);
  await user.keyboard('6');
  expect(await screen.findByText(/save failed/i, {}, { timeout: 2000 })).toBeInTheDocument();
});

test('a file that needs re-saving (newer draft) saves on mount', async () => {
  render(<AnnotateEditor file={sampleGold()} needsSave={true} onBack={() => {}} />);
  await waitFor(() => expect(goldApi.saveGold).toHaveBeenCalledTimes(1), { timeout: 2000 });
});

test('no beat grid: says so and offers Back instead of crashing (Review Focus 1)', async () => {
  const onBack = vi.fn();
  render(<AnnotateEditor file={sampleGold({ beats: [] })} needsSave={false} onBack={onBack} />);
  expect(screen.getByText(/no beat grid/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /back/i }));
  expect(onBack).toHaveBeenCalled();
});

test('changing the key on a labeled song asks keep vs transpose', async () => {
  const user = userEvent.setup();
  render(<AnnotateEditor file={sampleGold()} needsSave={false} onBack={() => {}} />);
  await user.keyboard('6'); // Am
  await user.selectOptions(screen.getByLabelText(/key tonic/i), 'D');
  await user.click(screen.getByRole('button', { name: /transpose the chords/i }));
  expect(labels('span')).toEqual(['B:min']); // C → D = +2 semitones
});
```

Create `web/src/annotate/Annotate.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import type { Chart } from '../lib/types';
import * as api from '../lib/api';
import { sampleGold } from '../lib/gold/sample.ts';
import Annotate from './Annotate.tsx';
import * as goldApi from './goldApi.ts';

vi.mock('../playback/YouTubePlayer', () => ({ default: () => <div data-testid="yt" /> }));
vi.mock('../lib/api', () => ({ analyzeUrl: vi.fn(), pollJob: vi.fn() }));
vi.mock('./goldApi.ts', () => ({
  listGold: vi.fn(), loadGold: vi.fn(), saveGold: vi.fn(() => Promise.resolve()),
}));

const chart = (videoId: string | null): Chart => ({
  schemaVersion: 1,
  source: { kind: videoId ? 'youtube' : 'file', videoId, title: 'A Song', duration: 12 },
  analysis: { engineVersion: '0.2.1', createdAt: 'now' },
  key: { tonic: 'C', mode: 'major', confidence: 0.9 }, scales: [], tempo: { bpm: 120 },
  beats: Array.from({ length: 24 }, (_, i) => i * 0.5), sections: [],
  chords: [{ start: 0, end: 4, label: 'Am', root: 'A', quality: 'min', bass: 'A', confidence: 0.5 }],
});

beforeEach(() => {
  vi.mocked(goldApi.listGold).mockResolvedValue([
    { videoId: 'abcdefghijk', title: 'Sample Song', updatedAt: '2026-09-24T00:00:00.000Z', labeledSeconds: 42 },
  ]);
  vi.mocked(goldApi.loadGold).mockReset();
  vi.mocked(api.analyzeUrl).mockReset();
  vi.mocked(api.pollJob).mockReset();
});

test('home lists saved songs and resumes one', async () => {
  vi.mocked(goldApi.loadGold).mockResolvedValue({ file: sampleGold(), needsSave: false });
  render(<Annotate />);
  await userEvent.click(await screen.findByRole('button', { name: /resume sample song/i }));
  expect(await screen.findAllByTestId('sheet-row')).not.toHaveLength(0);
});

test('a new YouTube song is analyzed, then opened as an unlabeled file', async () => {
  vi.mocked(api.analyzeUrl).mockResolvedValue('job1');
  vi.mocked(api.pollJob).mockResolvedValue(chart('vjr9Madg_sI'));
  vi.mocked(goldApi.loadGold).mockResolvedValue(null);
  render(<Annotate />);
  await userEvent.type(await screen.findByLabelText(/youtube url/i), 'https://www.youtube.com/watch?v=vjr9Madg_sI');
  await userEvent.click(screen.getByRole('button', { name: /^start$/i }));
  expect(await screen.findAllByTestId('sheet-row')).not.toHaveLength(0);
  expect(goldApi.saveGold).not.toHaveBeenCalled(); // nothing is written until the first edit
});

test('a song that is already labeled opens its saved file instead of a fresh one', async () => {
  vi.mocked(api.analyzeUrl).mockResolvedValue('job1');
  vi.mocked(api.pollJob).mockResolvedValue(chart('abcdefghijk'));
  vi.mocked(goldApi.loadGold).mockResolvedValue({
    file: sampleGold({
      spans: [{ start: 0, end: 4, root: 'A', quality: 'min', label: 'A:min', flag: 'guess', source: 'manual' }],
    }),
    needsSave: false,
  });
  render(<Annotate />);
  await userEvent.type(await screen.findByLabelText(/youtube url/i), 'https://youtu.be/abcdefghijk');
  await userEvent.click(screen.getByRole('button', { name: /^start$/i }));
  const chips = await screen.findAllByTestId('chip');
  expect(chips.some((c) => c.getAttribute('data-kind') === 'span')).toBe(true);
});

test('an uploaded file (no videoId) is refused with a clear message (Review Focus 2)', async () => {
  vi.mocked(api.analyzeUrl).mockResolvedValue('job1');
  vi.mocked(api.pollJob).mockResolvedValue(chart(null));
  render(<Annotate />);
  await userEvent.type(await screen.findByLabelText(/youtube url/i), 'https://example.com/x.wav');
  await userEvent.click(screen.getByRole('button', { name: /^start$/i }));
  expect(await screen.findByText(/needs a YouTube URL/i)).toBeInTheDocument();
});
```

Create `web/src/App.annotate.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import App from './App';

vi.mock('./annotate/goldApi.ts', () => ({
  listGold: vi.fn(() => Promise.resolve([])), loadGold: vi.fn(), saveGold: vi.fn(),
}));

afterEach(() => {
  window.location.hash = '';
});

test('#annotate mounts the annotator in dev; the normal landing stays the default', async () => {
  window.location.hash = '#annotate';
  const { unmount } = render(<App />);
  expect(await screen.findByRole('heading', { name: /gold-set annotator/i })).toBeInTheDocument();
  unmount();
  window.location.hash = '';
  render(<App />);
  expect(screen.queryByRole('heading', { name: /gold-set annotator/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run src/annotate/layout.test.ts src/annotate/AnnotateEditor.test.tsx src/annotate/Annotate.test.tsx src/App.annotate.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

Create `web/src/annotate/layout.ts`:

```ts
import type { ChordChoice, Flag, GoldFile, Provenance } from '../lib/gold/types.ts';
import { firstBeatAtOrAfter, type SheetRow } from '../lib/gold/grid.ts';
import type { Ghost } from '../lib/gold/spans.ts';

/** One chip on the sheet: an unreviewed engine chord (ghost) or a labeled span. */
export interface Seg {
  key: string;
  kind: 'ghost' | 'span';
  startBeat: number;
  /** exclusive */
  endBeat: number;
  chord: ChordChoice;
  flag?: Flag;
  source?: Provenance;
}

export function buildSegments(file: GoldFile, beats: number[], ghosts: Ghost[], tol: number): Seg[] {
  const range = (start: number, end: number) => {
    const s = firstBeatAtOrAfter(beats, start - tol);
    return { s, e: Math.max(firstBeatAtOrAfter(beats, end - tol), s + 1) }; // always at least one beat wide
  };
  const segs: Seg[] = [];
  for (const g of ghosts) {
    const { s, e } = range(g.start, g.end);
    segs.push({ key: `g${g.start}`, kind: 'ghost', startBeat: s, endBeat: e, chord: g.chord });
  }
  for (const sp of file.spans) {
    const { s, e } = range(sp.start, sp.end);
    segs.push({
      key: `s${sp.start}`, kind: 'span', startBeat: s, endBeat: e,
      chord: { root: sp.root, quality: sp.quality }, flag: sp.flag, source: sp.source,
    });
  }
  return segs;
}

/** 1-based CSS grid columns a segment occupies within a row, or null if it misses the row. */
export function clipToRow(seg: Seg, row: SheetRow): { colStart: number; colEnd: number } | null {
  const a = Math.max(seg.startBeat, row.startBeat);
  const b = Math.min(seg.endBeat, row.startBeat + row.cols);
  return b > a ? { colStart: a - row.startBeat + 1, colEnd: b - row.startBeat + 1 } : null;
}

export function columnFromClick(x: number, left: number, width: number, cols: number): number {
  if (width <= 0) return 0;
  return Math.min(cols - 1, Math.max(0, Math.floor(((x - left) / width) * cols)));
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
```

Create `web/src/annotate/useAnnotator.ts`:

```ts
import { useEffect, useReducer, useState } from 'react';
import type { GoldFile } from '../lib/gold/types.ts';
import { initState, reduce } from './annotatorReducer.ts';
import { saveGold } from './goldApi.ts';

export const SAVE_DEBOUNCE_MS = 500;
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Reducer + debounced autosave. An untouched file is never written unless it needs a re-save (newer draft). */
export function useAnnotator(initial: GoldFile, needsSave: boolean) {
  const [state, dispatch] = useReducer(reduce, initial, initState);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  useEffect(() => {
    if (state.file === initial && !needsSave) return;
    setSaveStatus('saving');
    const timer = setTimeout(() => {
      saveGold(state.file).then(
        () => setSaveStatus('saved'),
        () => setSaveStatus('error'),
      );
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state.file, initial, needsSave]);

  return { state, dispatch, saveStatus };
}
```

Create `web/src/annotate/AnnotateSheet.tsx`:

```tsx
import type { CSSProperties } from 'react';
import { chordName, numeralFor } from '../lib/gold/degrees.ts';
import type { SheetRow } from '../lib/gold/grid.ts';
import type { GoldKey } from '../lib/gold/types.ts';
import { clipToRow, columnFromClick, formatTime, type Seg } from './layout.ts';

const INK = 'oklch(0.28 0.02 70)';
const MUTED = 'oklch(0.55 0.02 70)';
const ACCENT = 'oklch(0.62 0.14 65)';
const LINE = 'oklch(0.85 0.01 80)';
const LINE_STRONG = 'oklch(0.7 0.02 75)';

function chipStyle(seg: Seg, colStart: number, colEnd: number): CSSProperties {
  const base: CSSProperties = {
    gridColumn: `${colStart} / ${colEnd}`, gridRow: 1, margin: '3px 2px', borderRadius: 6,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    minHeight: 36, fontWeight: 600, fontSize: 15, lineHeight: 1.15, zIndex: 1, overflow: 'hidden',
    color: INK,
  };
  if (seg.kind === 'ghost') {
    return { ...base, border: `1.5px dashed ${LINE_STRONG}`, color: MUTED, fontWeight: 500, background: 'oklch(0.97 0.006 85)' };
  }
  if (seg.flag === 'skip') {
    return {
      ...base, color: MUTED, border: `1.5px solid ${LINE_STRONG}`,
      background: 'repeating-linear-gradient(45deg, oklch(0.92 0.01 80) 0 6px, transparent 6px 12px)',
    };
  }
  return {
    ...base, background: 'oklch(0.95 0.05 75)',
    border: `1.5px ${seg.flag === 'sure' ? 'solid' : 'dashed'} ${ACCENT}`,
  };
}

export interface AnnotateSheetProps {
  rows: SheetRow[];
  beats: number[];
  segs: Seg[];
  keyInfo: GoldKey;
  cursor: number;
  playheadBeat: number;
  onSelectBeat: (beat: number) => void;
}

export default function AnnotateSheet({ rows, beats, segs, keyInfo, cursor, playheadBeat, onSelectBeat }: AnnotateSheetProps) {
  return (
    <div style={{ padding: '8px 16px 48px' }}>
      {rows.map((row) => {
        const BARS_PER_ROW = 4; // matches buildRows' default
        const firstBeat = Math.max(0, row.startBeat);
        const cursorHere = cursor >= row.startBeat && cursor < row.startBeat + row.cols;
        const playHere = playheadBeat >= row.startBeat && playheadBeat < row.startBeat + row.cols;
        return (
          <div key={row.startBeat} data-testid="sheet-row" style={{ display: 'flex', alignItems: 'stretch', marginBottom: 6 }}>
            <div style={{ width: 58, flex: 'none', fontSize: 11, color: MUTED, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <b>{formatTime(beats[firstBeat] ?? 0)}</b>
              <span>bar {row.startBar + 1}</span>
            </div>
            <div
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                onSelectBeat(row.startBeat + columnFromClick(e.clientX, r.left, r.width, row.cols));
              }}
              style={{
                position: 'relative', flex: 1, display: 'grid', gridTemplateColumns: `repeat(${row.cols}, 1fr)`,
                minHeight: 46, cursor: 'pointer', borderRight: `2px solid ${LINE_STRONG}`,
                backgroundImage:
                  `linear-gradient(to right, ${LINE_STRONG} 2px, transparent 2px), linear-gradient(to right, ${LINE} 1px, transparent 1px)`,
                backgroundSize: `calc(100% / ${BARS_PER_ROW}) 100%, calc(100% / ${row.cols}) 100%`,
              }}
            >
              {playHere && (
                <div style={{ gridColumn: playheadBeat - row.startBeat + 1, gridRow: 1, background: 'oklch(0.85 0.12 75 / 0.35)', zIndex: 0 }} />
              )}
              {segs.map((seg) => {
                const clip = clipToRow(seg, row);
                if (!clip) return null;
                return (
                  <div
                    key={seg.key}
                    data-testid="chip"
                    data-kind={seg.kind}
                    data-label={seg.chord.quality === 'N' ? 'N' : seg.chord.quality === 'X' ? 'X' : `${seg.chord.root}:${seg.chord.quality}`}
                    style={chipStyle(seg, clip.colStart, clip.colEnd)}
                  >
                    <span>{numeralFor(keyInfo, seg.chord)}</span>
                    <small style={{ fontWeight: 400, color: MUTED, fontSize: 11 }}>{chordName(seg.chord)}</small>
                  </div>
                );
              })}
              {cursorHere && (
                <div
                  id="cursor-marker"
                  data-testid="cursor"
                  style={{
                    gridColumn: cursor - row.startBeat + 1, gridRow: 1, zIndex: 2, pointerEvents: 'none',
                    outline: `2px solid ${ACCENT}`, outlineOffset: -1, borderRadius: 4,
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

Create `web/src/annotate/TopBar.tsx`:

```tsx
import { useState, type MouseEvent } from 'react';
import { PITCH_NAMES, type PaletteEntry } from '../lib/gold/degrees.ts';
import type { GridQuality } from '../lib/gold/grid.ts';
import type { GoldFile, Mode } from '../lib/gold/types.ts';
import YouTubePlayer, { type PlayerControls } from '../playback/YouTubePlayer';
import type { Action } from './annotatorReducer.ts';
import type { SaveStatus } from './useAnnotator.ts';

const MUTED = 'oklch(0.55 0.02 70)';
const BORDER = 'oklch(0.85 0.01 80)';

const btn = {
  padding: '5px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, background: 'white',
  font: 'inherit', fontSize: 13, cursor: 'pointer',
} as const;
// keep keyboard focus on the page so chord keys keep working after a click
const keep = { tabIndex: -1, onMouseDown: (e: MouseEvent) => e.preventDefault() } as const;

export interface TopBarProps {
  file: GoldFile;
  palette: PaletteEntry[];
  flatPending: boolean;
  canUndo: boolean;
  canRedo: boolean;
  quality: GridQuality;
  saveStatus: SaveStatus;
  embedError: number | null;
  controls: PlayerControls | null;
  onDispatch: (a: Action) => void;
  onPlayer: (c: PlayerControls) => void;
  onEmbedError: (code: number) => void;
  onBack: () => void;
}

const SAVE_TEXT: Record<SaveStatus, string> = { idle: '', saving: 'Saving…', saved: 'Saved ✓', error: 'Save failed — kept in this browser, will retry' };

export default function TopBar(p: TopBarProps) {
  const { file } = p;
  const [pendingKey, setPendingKey] = useState<{ tonic: string; mode: Mode } | null>(null);
  const [slow, setSlow] = useState(false);

  function requestKey(tonic: string, mode: Mode) {
    if (tonic === file.key.tonic && mode === file.key.mode) return;
    if (file.spans.length === 0) p.onDispatch({ type: 'setKey', tonic, mode, transpose: false });
    else setPendingKey({ tonic, mode });
  }
  function applyKey(transpose: boolean) {
    if (pendingKey) p.onDispatch({ type: 'setKey', ...pendingKey, transpose });
    setPendingKey(null);
  }

  return (
    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, background: 'oklch(0.985 0.005 85)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 10 }}>
        <button style={btn} onClick={p.onBack}>← Back</button>
        <h1 style={{ margin: 0, fontSize: 18 }}>{file.title}</h1>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: p.saveStatus === 'error' ? 'oklch(0.5 0.18 25)' : MUTED }}>
          {SAVE_TEXT[p.saveStatus]}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <YouTubePlayer videoId={file.videoId} width={360} onReady={p.onPlayer} onError={p.onEmbedError} />
          {p.embedError !== null && (
            <div role="alert" style={{ marginTop: 6, fontSize: 12, color: 'oklch(0.5 0.18 25)' }}>
              This video can’t be embedded (YouTube error {p.embedError}).{' '}
              <a href={file.url} target="_blank" rel="noreferrer">Open on YouTube ↗</a>
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 320, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
            <label>Key{' '}
              <select aria-label="Key tonic" value={file.key.tonic} onChange={(e) => { requestKey(e.target.value, file.key.mode); e.currentTarget.blur(); }}>
                {PITCH_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>{' '}
              <select aria-label="Key mode" value={file.key.mode} onChange={(e) => { requestKey(file.key.tonic, e.target.value as Mode); e.currentTarget.blur(); }}>
                <option value="major">major</option>
                <option value="minor">minor</option>
              </select>
            </label>
            <span style={{ color: MUTED }}>({file.key.source === 'engine' ? 'engine’s guess — set this first' : 'set by you'})</span>
            <label>Beats per bar{' '}
              <select aria-label="Beats per bar" value={file.grid.beatsPerBar} onChange={(e) => { p.onDispatch({ type: 'setBeatsPerBar', value: Number(e.target.value) }); e.currentTarget.blur(); }}>
                {[2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <span>Beat 1 = grid beat #{file.grid.downbeatBeat + 1}{' '}
              <button {...keep} style={btn} aria-label="Move beat 1 earlier" onClick={() => p.onDispatch({ type: 'setDownbeat', value: file.grid.downbeatBeat - 1 })}>−</button>{' '}
              <button {...keep} style={btn} aria-label="Move beat 1 later" onClick={() => p.onDispatch({ type: 'setDownbeat', value: file.grid.downbeatBeat + 1 })}>+</button>
            </span>
          </div>

          <div style={{ fontSize: 12, color: p.quality.loose ? 'oklch(0.5 0.18 25)' : MUTED }}>
            {Math.round(p.quality.bpm)} BPM · beat spacing varies ±{(p.quality.cv * 100).toFixed(0)}%
            {p.quality.loose && ' — loose grid: chord timing on this song will be approximate'}
          </div>

          {pendingKey && (
            <div role="group" aria-label="Change key" style={{ padding: 8, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13 }}>
              Change the key to {pendingKey.tonic} {pendingKey.mode}? This song already has labels.{' '}
              <button style={btn} onClick={() => applyKey(false)}>Keep the chords</button>{' '}
              <button style={btn} onClick={() => applyKey(true)}>Transpose the chords</button>{' '}
              <button style={btn} onClick={() => setPendingKey(null)}>Cancel</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {p.palette.map((e) => (
              <button key={e.digit} {...keep} style={{ ...btn, minWidth: 54, lineHeight: 1.2 }}
                onClick={() => p.onDispatch({ type: 'digit', digit: e.digit })}>
                <b>{e.digit}</b> {e.numeral}<br /><small style={{ color: MUTED }}>{e.name}</small>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
            <button {...keep} style={{ ...btn, outline: p.flatPending ? '2px solid oklch(0.62 0.14 65)' : 'none' }} onClick={() => p.onDispatch({ type: 'flatPrefix' })}>b ♭ (next digit)</button>
            <button {...keep} style={btn} onClick={() => p.onDispatch({ type: 'toggle', which: 'm' })}>m minor</button>
            <button {...keep} style={btn} onClick={() => p.onDispatch({ type: 'toggle', which: 'd' })}>d ♭7</button>
            <button {...keep} style={btn} onClick={() => p.onDispatch({ type: 'toggle', which: 'j' })}>j maj7</button>
            <button {...keep} style={btn} onClick={() => p.onDispatch({ type: 'mark', kind: 'N' })}>n no chord</button>
            <button {...keep} style={btn} onClick={() => p.onDispatch({ type: 'mark', kind: 'X' })}>x unsure</button>
            <button {...keep} style={btn} disabled={!p.canUndo} onClick={() => p.onDispatch({ type: 'undo' })}>↶ undo</button>
            <button {...keep} style={btn} disabled={!p.canRedo} onClick={() => p.onDispatch({ type: 'redo' })}>↷ redo</button>
            <button {...keep} style={btn} disabled={!p.controls}
              onClick={() => { p.controls?.setPlaybackRate(slow ? 1 : 0.5); setSlow(!slow); }}>
              {slow ? '½× speed (on)' : '1× speed'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: MUTED }}>
            Keys: 1–7 place · b then 1–7 flat · m/d/j quality · n/x · Enter confirm · Backspace clear · ←→↑↓ move · Space play · ⌘Z undo
          </div>
        </div>
      </div>
    </div>
  );
}
```

Create `web/src/annotate/AnnotateEditor.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { beatIndexAt } from '../lib/beats';
import { paletteFor } from '../lib/gold/degrees.ts';
import { buildRows, effectiveBeats, gridQuality, meanInterval } from '../lib/gold/grid.ts';
import { computeGhosts } from '../lib/gold/spans.ts';
import type { GoldFile } from '../lib/gold/types.ts';
import type { PlayerControls } from '../playback/YouTubePlayer';
import { usePlaybackTime } from '../playback/usePlaybackTime';
import AnnotateSheet from './AnnotateSheet.tsx';
import TopBar from './TopBar.tsx';
import { isTypingTarget, keyToAction } from './keymap.ts';
import { buildSegments } from './layout.ts';
import { useAnnotator } from './useAnnotator.ts';

export interface AnnotateEditorProps {
  file: GoldFile;
  /** true when the file came from a newer localStorage draft and must be re-saved */
  needsSave: boolean;
  onBack: () => void;
}

export default function AnnotateEditor({ file, needsSave, onBack }: AnnotateEditorProps) {
  const { state, dispatch, saveStatus } = useAnnotator(file, needsSave);
  const [controls, setControls] = useState<PlayerControls | null>(null);
  const [embedError, setEmbedError] = useState<number | null>(null);
  const time = usePlaybackTime(controls);
  const f = state.file;

  const beats = useMemo(() => effectiveBeats(f.beats, f.grid), [f.beats, f.grid]);
  const tol = 0.45 * meanInterval(beats);
  const ghosts = useMemo(() => computeGhosts(f.engine.chords, f.spans, f.blind), [f.engine.chords, f.spans, f.blind]);
  const segs = useMemo(() => buildSegments(f, beats, ghosts, tol), [f, beats, ghosts, tol]);
  const rows = useMemo(() => buildRows(beats.length, f.grid.beatsPerBar, f.grid.downbeatBeat), [beats.length, f.grid.beatsPerBar, f.grid.downbeatBeat]);
  const quality = useMemo(() => gridQuality(beats), [beats]);
  const palette = useMemo(() => paletteFor(f.key), [f.key]);
  const playheadBeat = beatIndexAt(beats, time);

  // keyboard: chord entry, movement, undo, play/pause. Ignored while typing in a control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const action = keyToAction(e);
      if (!action) return;
      e.preventDefault();
      if (action.type === 'playPause') {
        if (controls) {
          if (controls.isPlaying()) controls.pause();
          else controls.play();
        }
        return;
      }
      dispatch(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controls, dispatch]);

  // the cursor follows the playhead while the video plays
  useEffect(() => {
    if (controls?.isPlaying() && playheadBeat >= 0) dispatch({ type: 'setCursor', beat: playheadBeat });
  }, [playheadBeat, controls, dispatch]);

  // keep the cursor's row in view
  useEffect(() => {
    document.getElementById('cursor-marker')?.scrollIntoView?.({ block: 'nearest' });
  }, [state.cursor]);

  if (beats.length < 2) {
    return (
      <div style={{ padding: 24 }}>
        <p>This song has no beat grid, so it can’t be annotated. Try another upload of the song.</p>
        <button onClick={onBack}>← Back</button>
      </div>
    );
  }

  return (
    <div data-screen-label="Annotate">
      <TopBar
        file={f}
        palette={palette}
        flatPending={state.flatPending}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        quality={quality}
        saveStatus={saveStatus}
        embedError={embedError}
        controls={controls}
        onDispatch={dispatch}
        onPlayer={setControls}
        onEmbedError={setEmbedError}
        onBack={onBack}
      />
      <AnnotateSheet
        rows={rows}
        beats={beats}
        segs={segs}
        keyInfo={f.key}
        cursor={state.cursor}
        playheadBeat={playheadBeat}
        onSelectBeat={(beat) => {
          dispatch({ type: 'setCursor', beat });
          if (controls && beats[beat] !== undefined) controls.seekTo(beats[beat]); // click = play from here
        }}
      />
    </div>
  );
}
```

Create `web/src/annotate/Annotate.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { analyzeUrl, pollJob } from '../lib/api';
import { newGoldFromChart } from '../lib/gold/file.ts';
import type { GoldFile, GoldSummary } from '../lib/gold/types.ts';
import Analyzing from '../screens/Analyzing';
import AnnotateEditor from './AnnotateEditor.tsx';
import { listGold, loadGold } from './goldApi.ts';

type Phase =
  | { phase: 'home' }
  | { phase: 'loading' }
  | { phase: 'edit'; file: GoldFile; needsSave: boolean };

export default function Annotate() {
  const [phase, setPhase] = useState<Phase>({ phase: 'home' });
  const [songs, setSongs] = useState<GoldSummary[]>([]);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (phase.phase !== 'home') return;
    listGold().then(setSongs, () => setError('The gold store is unavailable — is this the Vite dev server (`npm run dev`)?'));
  }, [phase.phase]);

  async function start() {
    setError(null);
    setPhase({ phase: 'loading' });
    try {
      const chart = await pollJob(await analyzeUrl(url.trim()));
      const id = chart.source.videoId;
      const existing = id ? await loadGold(id) : null;
      // newGoldFromChart throws the "needs a YouTube URL" error when the chart has no video ID
      setPhase({ phase: 'edit', ...(existing ?? { file: newGoldFromChart(chart, url.trim()), needsSave: false }) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase({ phase: 'home' });
    }
  }

  async function resume(id: string) {
    setError(null);
    try {
      const loaded = await loadGold(id);
      if (!loaded) throw new Error('That song’s saved file is missing.');
      setPhase({ phase: 'edit', ...loaded });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (phase.phase === 'loading') return <Analyzing />;
  if (phase.phase === 'edit') {
    return (
      <AnnotateEditor
        key={phase.file.videoId}
        file={phase.file}
        needsSave={phase.needsSave}
        onBack={() => setPhase({ phase: 'home' })}
      />
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '48px auto', padding: '0 16px' }}>
      <h1 style={{ fontSize: 24 }}>Gold-set annotator</h1>
      <p style={{ color: 'oklch(0.55 0.02 70)' }}>
        Dev-only. Confirm or correct the engine’s chords by ear; labels save to <code>benchmarks/gold/annotations/</code>.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); void start(); }} style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <label style={{ flex: 1 }}>
          <span style={{ position: 'absolute', left: -9999 }}>YouTube URL</span>
          <input
            aria-label="YouTube URL" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…" style={{ width: '100%', padding: 8 }}
          />
        </label>
        <button type="submit" disabled={!url.trim()}>Start</button>
      </form>
      {error && <p role="alert" style={{ color: 'oklch(0.5 0.18 25)' }}>{error}</p>}
      {songs.length > 0 && (
        <>
          <h2 style={{ fontSize: 16 }}>Saved songs</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {songs.map((s) => (
              <li key={s.videoId} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '6px 0' }}>
                <span style={{ flex: 1 }}>{s.title}</span>
                <span style={{ fontSize: 12, color: 'oklch(0.55 0.02 70)' }}>{Math.round(s.labeledSeconds)} s labeled</span>
                <button onClick={() => void resume(s.videoId)} aria-label={`Resume ${s.title}`}>Resume</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
```

Modify `web/src/App.tsx`. Replace the imports block and the top of `App()` and add the annotate branch. The final file must read:

```tsx
import { lazy, Suspense, useEffect, useState } from 'react';
import Landing from './screens/Landing';
import Analyzing from './screens/Analyzing';
import Sheet from './screens/Sheet';
import { analyzeUrl, analyzeFile, pollJob } from './lib/api';
import type { Chart } from './lib/types';

type Stage = 'landing' | 'analyzing' | 'sheet';

// Dev-only annotator. `import.meta.env.DEV` is a build-time constant, so this whole
// branch (and the lazy chunk behind it) is dropped from production builds.
const Annotate = import.meta.env.DEV ? lazy(() => import('./annotate/Annotate.tsx')) : null;

export default function App() {
  const [stage, setStage] = useState<Stage>('landing');
  const [chart, setChart] = useState<Chart | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [urlValue, setUrlValue] = useState('');
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  async function run(submit: () => Promise<string>, file: File | null) {
    setError(null);
    setMediaFile(file);
    setStage('analyzing');
    try {
      const nextChart = await pollJob(await submit());
      setChart(nextChart);
      setStage('sheet');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage('landing');
    }
  }

  const onSubmitUrl = (url: string) => run(() => analyzeUrl(url), null);
  const onSubmitFile = (file: File) => run(() => analyzeFile(file), file);

  const onBack = () => {
    setStage('landing');
    setChart(null);
    setMediaFile(null);
    setError(null);
  };

  if (Annotate && hash === '#annotate') {
    return (
      <div style={{ minHeight: '100vh', background: 'oklch(0.972 0.008 85)', color: 'oklch(0.28 0.02 70)', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
        <Suspense fallback={null}>
          <Annotate />
        </Suspense>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'oklch(0.972 0.008 85)',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        color: 'oklch(0.28 0.02 70)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {stage === 'landing' && (
        <Landing
          value={urlValue}
          onChange={setUrlValue}
          onSubmitUrl={onSubmitUrl}
          onSubmitFile={onSubmitFile}
          error={error}
        />
      )}
      {stage === 'analyzing' && <Analyzing />}
      {stage === 'sheet' && chart && <Sheet chart={chart} mediaFile={mediaFile} onBack={onBack} />}
    </div>
  );
}
```

(This preserves the existing landing/analyzing/sheet behavior exactly; the only additions are the `lazy`/`Suspense`/`useEffect` imports, the `Annotate` constant, the `hash` state + listener, and the early `#annotate` return placed after every hook.)

- [ ] **Step 4: Run to verify they pass, and that nothing else regressed**

Run: `cd web && npx vitest run && npx tsc -b && npm run lint`
Expected: the entire suite PASSES (existing `App.test.tsx`, `Sheet.test.tsx`, … plus the new tests), no type errors, no new lint errors.
If `AnnotateEditor.test.tsx` "autosaves once" is flaky on timing, raise the `waitFor` timeout — do not shorten `SAVE_DEBOUNCE_MS`.

- [ ] **Step 5: Commit**

```bash
git add web/src/annotate web/src/App.tsx web/src/App.annotate.test.tsx
git commit -m "feat(annotate): lead-sheet editor UI, resume/new-song screen, and the dev-only #annotate route" \
           -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Dev-only proof, usage notes, and the acceptance run

**Files:**
- Create: `web/scripts/check-dev-only.mjs`, `benchmarks/gold/README.md`
- Modify: `web/package.json` (add a script), `.github/workflows/ci.yml` (add a step)

**Interfaces:**
- Consumes: the production build in `web/dist/`.
- Produces: `npm run check:dev-only` (exits 1 if the annotator leaked into `dist/`); a CI step that runs it after `npm run build`.

- [ ] **Step 1: Write the check script and see it catch a leak**

Create `web/scripts/check-dev-only.mjs`:

```js
// Fails the build if any annotator/gold-store code reached the production bundle.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
if (!fs.existsSync(dist)) {
  console.error('web/dist not found — run `npm run build` first.');
  process.exit(2);
}

const MARKERS = ['__gold', 'tabit:gold-draft', 'Gold-set annotator'];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const leaks = [];
for (const file of walk(dist)) {
  if (!/\.(js|mjs|css|html|map)$/.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const marker of MARKERS) if (text.includes(marker)) leaks.push(`${path.relative(dist, file)} contains "${marker}"`);
}

if (leaks.length) {
  console.error('The dev-only annotator leaked into the production build:\n  ' + leaks.join('\n  '));
  process.exit(1);
}
console.log('ok: no annotator code in dist/');
```

In `web/package.json`, add to `"scripts"` (after `"test"`):

```json
    "check:dev-only": "node scripts/check-dev-only.mjs"
```

(mind the comma on the preceding line).

Run: `cd web && npm run build && npm run check:dev-only`
Expected: build succeeds and the check prints `ok: no annotator code in dist/`.

- [ ] **Step 2: Prove the check can fail (so it is not vacuous)**

Run: `echo '/* __gold */' >> dist/assets/$(ls dist/assets | grep '\.js$' | head -1) && npm run check:dev-only; echo "exit=$?"`
Expected: prints the leak message and `exit=1`. Then rebuild to restore a clean `dist/`: `npm run build && npm run check:dev-only` → `ok`.

- [ ] **Step 3: Add the CI step and the usage README**

In `.github/workflows/ci.yml`, in the `web` job, add one line directly after `- run: npm run build`:

```yaml
      - run: npm run check:dev-only
```

Create `benchmarks/gold/README.md`:

````markdown
# tabIt gold set — songs labeled by ear

Ground truth for the songs tabIt is actually used on (modern guitar music the public
Beatles/Billboard sets don't cover). Made with the dev-only annotator in `web/`.
Only chord labels and timing are stored here — **no audio**.

## Label a song

```bash
cd web && source ~/.nvm/nvm.sh && nvm use 20 && npm run dev
# the tabIt helper must be running (it is a login agent: `tabit status`)
```

Open <http://localhost:5173/#annotate>, paste a YouTube URL, **set the key first**, then confirm or
correct the engine's ghost chips. Keys: `1`–`7` place a degree · `b` then `1`–`7` flat · `m` minor ·
`d` ♭7 · `j` maj7 · `n` no chord · `x` unsure · `Enter` confirm · `Backspace` clear · arrows move ·
`Space` play/pause · `⌘Z` undo. Clicking a beat also seeks the video there.

## Files (per song, `annotations/<videoId>.*`)

| File | What |
|------|------|
| `.json` | source of truth: key, grid, engine snapshot, your spans (absolute chords + sure/guess/skip + provenance) |
| `.lab` | sure + guess spans, Harte format; unreviewed regions and skips are `X` (ignored by the scorer) |
| `.sure.lab` | sure spans only |

`X` regions are ignored by `engine.eval.score_chart` on every metric, so partially labeled songs are fine.

## Not built yet

Manifest generation, boundary metric and per-stage scoring (separate spec); Slice 2 editor features
(`R` repeat, ½×/2× grid, click track, blind mode). See `docs/superpowers/specs/2026-09-24-tabit-gold-annotator-design.md`.
````

- [ ] **Step 4: Full verification**

Run, from the repo root:

```bash
cd web && source ~/.nvm/nvm.sh && nvm use 20 && npm test && npx tsc -b && npm run lint && npm run build && npm run check:dev-only
cd .. && .venv/bin/python -m pytest tests/test_gold_contract.py -q
```

Expected: all web tests pass, no type or new lint errors, build ok, `ok: no annotator code in dist/`, and the 2 contract tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/scripts/check-dev-only.mjs web/package.json .github/workflows/ci.yml benchmarks/gold/README.md
git commit -m "test(gold): prove the annotator is dev-only in CI; document the workflow" \
           -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Acceptance run (manual — needs the user; this is the spec's Definition of Done)**

Automated tests cannot host the real YouTube iframe, so this is verified by hand with the user:

1. `cd web && npm run dev`, open `http://localhost:5173/#annotate`.
2. Paste `https://www.youtube.com/watch?v=vjr9Madg_sI` (Beabadoobee — *Write Me A Letter*). It should analyze (cached: instant; else ~50 s) and open the editor with ghost chips.
3. Confirm the key, set beats/bar and beat 1 by ear (click a beat to hear from there; try the 0.5× button), then label ~60 seconds using digits / Enter / split.
4. Watch the status say **Saved ✓**. Check `benchmarks/gold/annotations/vjr9Madg_sI.json`, `.lab`, `.sure.lab` exist and the `.lab` starts `0.000 … X`.
5. Reload the page, open `#annotate`, **Resume** the song: labels and cursor-independent state are intact.
6. Score it through the existing runner with no converter: create `benchmarks/gold/manifest.yaml`:

   ```yaml
   - id: write_me_a_letter
     title: "Beabadoobee — Write Me A Letter"
     url: "https://www.youtube.com/watch?v=vjr9Madg_sI"
     lab: annotations/vjr9Madg_sI.lab
     ref_duration: 195.0
     offset_sec: 0.0
   ```

   then `source .venv/bin/activate && python -m benchmarks.chord_accuracy --manifest benchmarks/gold/manifest.yaml`. It prints per-metric scores. **Do not commit** the generated `benchmarks/gold/results/` (or the hand-made manifest) — manifest generation and labeled-duration weighting are the scoring spec's job; here we only prove the `.lab` loads and scores.
7. Record anything that felt wrong (especially the one-bar default for a run's last chord) in the anecdotal log in `docs/SPRINT_0_FINDINGS.md`, then decide what Slice 2 should prioritize.

If every step works, Slice 1 is done.
