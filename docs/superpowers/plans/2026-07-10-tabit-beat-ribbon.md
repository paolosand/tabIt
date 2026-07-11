# tabIt Beat Ribbon (compact extension panel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the extension panel's default expanded view with a ~170px-tall beat ribbon (one cell per detected beat, amber sweeping beat-by-beat, chord labels on their first beat) so chords are readable below the player without page scroll; the existing paper sheet moves behind a toggle.

**Architecture:** A new pure module `web/src/lib/beats.ts` (shared like `music.ts`, imported relatively by the extension) does all beat math. A new pure component `extension/src/overlay/Ribbon.tsx` renders a windowed track of beat cells; `Panel.tsx` is restructured to a one-line header + `ribbon|sheet` view state + beat-based footer. No engine/API change — `Chart.beats: number[]` already carries the full grid.

**Tech Stack:** TypeScript, React 19, vitest + @testing-library/react (existing extension test setup), esbuild.

**Spec:** `docs/superpowers/specs/2026-07-10-tabit-beat-ribbon-design.md`

## Global Constraints

- Work on branch `feat/beat-ribbon` (created from `main` in Task 0).
- Shared chart logic lives in `web/src/lib` and is imported relatively (`../../../web/src/lib/...`) — no copies in `extension/`.
- All UI stays inside the shadow root; all styling via classes in `extension/src/overlay/styles.ts` (no inline style objects for stateful styles).
- Design tokens (exact values): cell 44px wide × 64px tall; cell border `oklch(0.93 0.008 90)`; bar line every 4th beat from beat 0, 2px `oklch(0.82 0.012 90)`; chord label 21px ink `oklch(0.25 0.02 60)`; muted label `oklch(0.62 0.015 60)` at confidence < 0.75 (never for quality `N`); past-wash `oklch(0.965 0.012 90)`; current-beat amber `oklch(0.87 0.14 85)` radius 4px; pips 5px, hit `oklch(0.55 0.12 70)`, rest `oklch(0.85 0.02 85)`; right fade 70px.
- Ribbon slide: CSS `transition: transform 200ms linear`, disabled under `@media (prefers-reduced-motion: reduce)`.
- Zero-beat chord segments (no beat falls inside `[start, end)`) get **no ribbon cell or label** — they remain visible in the full sheet and the footer. (Amended from the spec's "one visual cell": keeping the track linear at `beatIndex × 44px` is worth more than showing sub-beat blips, which are typically noise.)
- Empty `chart.beats` → panel forces the sheet view, hides the toggle, and the footer falls back to seconds.
- Node 20 via nvm: `source ~/.nvm/nvm.sh && nvm use 20` before any npm command.
- Verification commands — web: `cd web && npm test`, `npx tsc -b --noEmit`; extension: `cd extension && npm test`, `npm run typecheck`, `npm run build`.

---

### Task 0: Shared beat math (`beats.ts`)

**Files:**
- Create: `web/src/lib/beats.ts`
- Test: `web/src/lib/beats.test.ts`

**Interfaces:**
- Consumes: `ChordSegment` from `web/src/lib/types.ts` (only `start`/`end`).
- Produces (used verbatim by Tasks 1–2):
  - `beatIndexAt(beats: number[], t: number): number` — index of last beat ≤ t; `-1` if t is before `beats[0]` or `beats` is empty.
  - `chordBeatSpan(beats: number[], chord: { start: number; end: number }): { firstBeat: number; beatCount: number }` — beats b with `chord.start ≤ beats[b] < chord.end`; `{ firstBeat: -1, beatCount: 0 }` when none.
  - `beatWithinChord(beats: number[], chord: { start: number; end: number }, t: number): number` — 1-based position of the current beat inside the chord, clamped to `[1, beatCount]`; `0` when `beatCount` is 0 or t precedes the chord's first beat.
  - `beatsUntil(beats: number[], t: number, target: number): number` — number of beats b with `t < beats[b] ≤ target` (whole beats until the next chord lands).

- [ ] **Step 0: Create the branch**

```bash
cd /Users/paolosandejas/Documents/PortfolioProjects/tabIt
git checkout main && git checkout -b feat/beat-ribbon
```

- [ ] **Step 1: Write the failing tests**

```ts
// web/src/lib/beats.test.ts
import { expect, test } from 'vitest';
import { beatIndexAt, chordBeatSpan, beatWithinChord, beatsUntil } from './beats';

const beats = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5]; // 8 beats, 0.5s apart

test('beatIndexAt: before first, exact, between, after last, empty', () => {
  expect(beatIndexAt(beats, 0.2)).toBe(-1);
  expect(beatIndexAt(beats, 1.0)).toBe(0);
  expect(beatIndexAt(beats, 2.24)).toBe(2);
  expect(beatIndexAt(beats, 99)).toBe(7);
  expect(beatIndexAt([], 5)).toBe(-1);
});

test('chordBeatSpan: full span, boundary inclusion/exclusion, zero-beat chord', () => {
  expect(chordBeatSpan(beats, { start: 1.0, end: 3.0 })).toEqual({ firstBeat: 0, beatCount: 4 }); // 1.0,1.5,2.0,2.5 (3.0 excluded)
  expect(chordBeatSpan(beats, { start: 2.0, end: 2.4 })).toEqual({ firstBeat: 2, beatCount: 1 });
  expect(chordBeatSpan(beats, { start: 2.1, end: 2.4 })).toEqual({ firstBeat: -1, beatCount: 0 }); // no beat inside
  expect(chordBeatSpan([], { start: 0, end: 10 })).toEqual({ firstBeat: -1, beatCount: 0 });
});

test('beatWithinChord: counts 1-based, clamps, zero-beat chord is 0', () => {
  const chord = { start: 1.0, end: 3.0 }; // beats 0..3
  expect(beatWithinChord(beats, chord, 1.0)).toBe(1);
  expect(beatWithinChord(beats, chord, 2.6)).toBe(4);
  expect(beatWithinChord(beats, chord, 0.5)).toBe(0);  // before the chord's first beat
  expect(beatWithinChord(beats, chord, 99)).toBe(4);   // clamped to beatCount
  expect(beatWithinChord(beats, { start: 2.1, end: 2.4 }, 2.2)).toBe(0);
});

test('beatsUntil: whole beats strictly after t up to and including target', () => {
  expect(beatsUntil(beats, 2.0, 3.0)).toBe(2);  // 2.5, 3.0
  expect(beatsUntil(beats, 2.0, 2.1)).toBe(0);
  expect(beatsUntil([], 0, 10)).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd web && npx vitest run src/lib/beats.test.ts`
Expected: FAIL — cannot resolve `./beats`.

- [ ] **Step 3: Implement**

```ts
// web/src/lib/beats.ts
/** Beat-grid math over Chart.beats (sorted beat timestamps in seconds). */

export function beatIndexAt(beats: number[], t: number): number {
  let lo = 0, hi = beats.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= t) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return ans;
}

export function chordBeatSpan(
  beats: number[], chord: { start: number; end: number },
): { firstBeat: number; beatCount: number } {
  // first beat with beats[b] >= chord.start
  const before = beatIndexAt(beats, chord.start);
  let first = before >= 0 && beats[before] === chord.start ? before : before + 1;
  if (first >= beats.length || beats[first] >= chord.end) return { firstBeat: -1, beatCount: 0 };
  const last = beatIndexAt(beats, chord.end - 1e-9);
  return { firstBeat: first, beatCount: last - first + 1 };
}

export function beatWithinChord(
  beats: number[], chord: { start: number; end: number }, t: number,
): number {
  const { firstBeat, beatCount } = chordBeatSpan(beats, chord);
  if (beatCount === 0) return 0;
  const cur = beatIndexAt(beats, t);
  if (cur < firstBeat) return 0;
  return Math.min(cur - firstBeat + 1, beatCount);
}

export function beatsUntil(beats: number[], t: number, target: number): number {
  return beatIndexAt(beats, target) - beatIndexAt(beats, t);
}
```

Note `beatsUntil(beats, 2.0, 3.0)`: `beatIndexAt(…,3.0)=4`, `beatIndexAt(…,2.0)=2` → 2. ✓

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/beats.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Full web + extension sweeps (imports untouched, but prove it)**

Run: `cd web && npm test && npx tsc -b --noEmit && cd ../extension && npm run typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/beats.ts web/src/lib/beats.test.ts
git commit -m "feat(lib): shared beat-grid math for the beat ribbon"
```

---

### Task 1: `Ribbon.tsx` + styles

**Files:**
- Create: `extension/src/overlay/Ribbon.tsx`
- Modify: `extension/src/overlay/styles.ts` (append ribbon styles)
- Test: `extension/src/overlay/Ribbon.test.tsx`

**Interfaces:**
- Consumes: `beatIndexAt`, `chordBeatSpan`, `beatWithinChord` from `../../../web/src/lib/beats`.
- Produces (Task 2 renders exactly this):

```ts
export interface RibbonChord {
  start: number; end: number;
  label: string;        // already transposed by Panel
  quality: string;      // 'N' renders no label
  low: boolean;         // confidence < 0.75 && quality !== 'N'
}
export interface RibbonProps {
  beats: number[];
  chords: RibbonChord[];
  currentBeat: number;        // beatIndexAt(beats, time) — may be -1 pre-intro
  currentChordIndex: number;  // findCurrentIndex(chords, time)
}
export default function Ribbon(props: RibbonProps): JSX.Element;
```

- [ ] **Step 1: Write the failing tests**

```tsx
// extension/src/overlay/Ribbon.test.tsx
import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import Ribbon from './Ribbon';

// 16 beats at 1s intervals starting t=0; four 4-beat chords.
const beats = Array.from({ length: 16 }, (_, i) => i);
const chords = [
  { start: 0, end: 4, label: 'Am', quality: 'min', low: false },
  { start: 4, end: 8, label: 'F', quality: 'maj', low: true },
  { start: 8, end: 12, label: 'N', quality: 'N', low: false },
  { start: 12, end: 16, label: 'G', quality: 'maj', low: false },
];

function rib(currentBeat: number, currentChordIndex: number) {
  return render(
    <Ribbon beats={beats} chords={chords} currentBeat={currentBeat} currentChordIndex={currentChordIndex} />,
  ).container;
}

test('labels sit on each chord first beat only; N gets no label', () => {
  const c = rib(0, 0);
  const cells = c.querySelectorAll('.tabit-beat');
  expect(cells.length).toBeGreaterThanOrEqual(16);
  expect(c.querySelectorAll('.tabit-beat-chord').length).toBe(3); // Am, F, G — no N label
  expect(cells[0].querySelector('.tabit-beat-chord')?.textContent).toBe('Am');
  expect(cells[4].querySelector('.tabit-beat-chord')?.textContent).toBe('F');
  expect(cells[1].querySelector('.tabit-beat-chord')).toBeNull();
});

test('current beat is amber, passed beats of current chord are washed', () => {
  const c = rib(6, 1); // chord F (beats 4-7), on beat 6
  const cells = c.querySelectorAll('.tabit-beat');
  expect(cells[6].className).toContain('tabit-beat-now');
  expect(cells[4].className).toContain('tabit-beat-done');
  expect(cells[5].className).toContain('tabit-beat-done');
  expect(cells[7].className).not.toContain('tabit-beat-done');
});

test('pips on the current chord count consumed beats', () => {
  const c = rib(6, 1); // beat 3 of 4 within F
  const pips = c.querySelectorAll('.tabit-beat-pip');
  expect(pips.length).toBe(4);
  expect(c.querySelectorAll('.tabit-beat-pip-hit').length).toBe(3);
});

test('low-confidence label is muted; bar line every 4th beat', () => {
  const c = rib(0, 0);
  const f = c.querySelectorAll('.tabit-beat')[4].querySelector('.tabit-beat-chord');
  expect(f?.className).toContain('tabit-beat-chord-muted');
  expect(c.querySelectorAll('.tabit-beat')[4].className).toContain('tabit-beat-bar');
  expect(c.querySelectorAll('.tabit-beat')[5].className).not.toContain('tabit-beat-bar');
});

test('track slides to keep the current beat in view; pre-intro parks at start', () => {
  expect(rib(12, 3).querySelector('.tabit-ribbon-track')?.getAttribute('style')).toContain('translateX(-');
  expect(rib(-1, 0).querySelector('.tabit-ribbon-track')?.getAttribute('style')).toContain('translateX(0');
});

test('windows the render: far-away beats get no cell', () => {
  const many = Array.from({ length: 400 }, (_, i) => i);
  const c = render(
    <Ribbon beats={many} chords={[{ start: 0, end: 400, label: 'A', quality: 'maj', low: false }]} currentBeat={200} currentChordIndex={0} />,
  ).container;
  expect(c.querySelectorAll('.tabit-beat').length).toBeLessThan(100);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd extension && npx vitest run src/overlay/Ribbon.test.tsx`
Expected: FAIL — cannot resolve `./Ribbon`.

- [ ] **Step 3: Implement Ribbon**

```tsx
// extension/src/overlay/Ribbon.tsx
import { useMemo } from 'react';
import { chordBeatSpan, beatWithinChord } from '../../../web/src/lib/beats';

export interface RibbonChord {
  start: number; end: number; label: string; quality: string; low: boolean;
}
export interface RibbonProps {
  beats: number[];
  chords: RibbonChord[];
  currentBeat: number;
  currentChordIndex: number;
}

const CELL = 44;         // px, must match .tabit-beat min-width in styles.ts
const LEAD_CELLS = 8;    // keep "now" ~1/3 from the left edge
const WINDOW = 30;       // cells rendered either side of now

/** Windowed beat-grid strip. Pure renderer: Panel computes time-derived indices. */
export default function Ribbon({ beats, chords, currentBeat, currentChordIndex }: RibbonProps) {
  // beat index -> chord index (memoized; -1 where no chord covers the beat)
  const beatChord = useMemo(() => {
    const map = new Array<number>(beats.length).fill(-1);
    chords.forEach((c, ci) => {
      const { firstBeat, beatCount } = chordBeatSpan(beats, c);
      for (let b = firstBeat; b >= 0 && b < firstBeat + beatCount; b++) map[b] = ci;
    });
    return map;
  }, [beats, chords]);

  const anchor = Math.max(0, currentBeat);
  const from = Math.max(0, anchor - WINDOW);
  const to = Math.min(beats.length, anchor + WINDOW);
  const current = chords[currentChordIndex];
  const curSpan = current ? chordBeatSpan(beats, current) : { firstBeat: -1, beatCount: 0 };
  const curWithin = current ? beatWithinChord(beats, current, beats[currentBeat] ?? -Infinity) : 0;
  const offset = currentBeat <= 0 ? 0 : (currentBeat - LEAD_CELLS) * CELL;
  const tx = Math.max(0, offset);

  const cells = [];
  for (let b = from; b < to; b++) {
    const ci = beatChord[b];
    const chord = ci >= 0 ? chords[ci] : undefined;
    const isFirstOfChord = chord ? chordBeatSpan(beats, chord).firstBeat === b : false;
    const showLabel = !!chord && isFirstOfChord && chord.quality !== 'N';
    const cls = [
      'tabit-beat',
      b % 4 === 0 ? 'tabit-beat-bar' : '',
      b === currentBeat ? 'tabit-beat-now' : '',
      ci === currentChordIndex && b < currentBeat ? 'tabit-beat-done' : '',
    ].filter(Boolean).join(' ');
    cells.push(
      <div key={b} className={cls} style={{ left: b * CELL }}>
        {showLabel && (
          <span className={`tabit-beat-chord${chord!.low ? ' tabit-beat-chord-muted' : ''}`}>
            {chord!.label}
          </span>
        )}
        {ci === currentChordIndex && isFirstOfChord && curSpan.beatCount > 0 && (
          <span className="tabit-beat-pips">
            {Array.from({ length: curSpan.beatCount }, (_, p) => (
              <span key={p} className={`tabit-beat-pip${p < curWithin ? ' tabit-beat-pip-hit' : ''}`} />
            ))}
          </span>
        )}
      </div>,
    );
  }

  return (
    <div className="tabit-ribbon" data-testid="ribbon">
      <div
        className="tabit-ribbon-track"
        style={{ width: beats.length * CELL, transform: `translateX(${-tx}px)` }}
        /* `${-tx}` renders "0" when tx is 0 (JS stringifies -0 as "0"), matching the
           parked-at-start test; nonzero tx renders "-176" etc. */
      >
        {cells}
      </div>
      <div className="tabit-ribbon-fade" />
    </div>
  );
}
```

- [ ] **Step 4: Append ribbon styles to `styles.ts`** (inside the exported css string, after the sheet styles)

```css
/* --- beat ribbon --- */
.tabit-ribbon { position: relative; overflow: hidden; height: 86px; padding-top: 12px; }
.tabit-ribbon-track {
  position: relative; height: 64px;
  transition: transform 200ms linear;
}
@media (prefers-reduced-motion: reduce) { .tabit-ribbon-track { transition: none; } }
.tabit-beat {
  position: absolute; top: 0; width: 44px; height: 64px;
  border-left: 1px solid oklch(0.93 0.008 90);
}
.tabit-beat-bar { border-left: 2px solid oklch(0.82 0.012 90); }
.tabit-beat-done { background: oklch(0.965 0.012 90); }
.tabit-beat-now { background: oklch(0.87 0.14 85); border-radius: 4px; }
.tabit-beat-chord {
  position: absolute; left: 6px; top: 10px; z-index: 2;
  font-size: 21px; color: oklch(0.25 0.02 60); white-space: nowrap;
}
.tabit-beat-chord-muted { color: oklch(0.62 0.015 60); }
.tabit-beat-pips { position: absolute; bottom: 6px; left: 8px; display: flex; gap: 5px; z-index: 2; }
.tabit-beat-pip { width: 5px; height: 5px; border-radius: 50%; background: oklch(0.85 0.02 85); }
.tabit-beat-pip-hit { background: oklch(0.55 0.12 70); }
.tabit-ribbon-fade {
  position: absolute; right: 0; top: 0; bottom: 0; width: 70px; pointer-events: none;
  background: linear-gradient(to right, transparent, oklch(0.985 0.008 90));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/overlay/Ribbon.test.tsx`
Expected: 6 passed.

- [ ] **Step 6: Full extension sweep + commit**

```bash
npm test && npm run typecheck
git add src/overlay/Ribbon.tsx src/overlay/Ribbon.test.tsx src/overlay/styles.ts
git commit -m "feat(ext): beat ribbon component with amber beat sweep"
```

---

### Task 2: Panel restructure — compact header, view toggle, beat footer

**Files:**
- Modify: `extension/src/overlay/Panel.tsx`, `extension/src/overlay/styles.ts`
- Test: extend `extension/src/overlay/Panel.test.tsx`

**Interfaces:**
- Consumes: `Ribbon`/`RibbonProps` (Task 1), `beatIndexAt`, `beatWithinChord`, `beatsUntil` (Task 0), existing `findCurrentIndex`/`formatLabel`/`transposeRoot`/`transposeScaleName`.
- Produces: no new exports; `Panel` keeps signature `({ chart, onCollapse })`. DOM contract for tests/e2e: `data-testid="ribbon"` in default view; toggle button `aria-label="Show full sheet"` / `aria-label="Show beat ribbon"`; the sheet view keeps `data-testid="marker"` and all existing classes.

- [ ] **Step 1: Write the failing tests** (append to `Panel.test.tsx`; the shared fixture gains beats)

```tsx
// Beats fixture: chart with a real beat grid (0.5s beats over the 20s chart)
const beatChart = { ...chart, beats: Array.from({ length: 40 }, (_, i) => i * 0.5) };

test('default view is the ribbon; toggle swaps to the full sheet and back', async () => {
  vi.spyOn(videoTime, 'useVideoTime').mockReturnValue({ time: 5, adShowing: false });
  render(<Panel chart={beatChart as never} onCollapse={() => {}} />);
  expect(screen.getByTestId('ribbon')).toBeInTheDocument();
  expect(screen.queryByTestId('marker')).toBeNull(); // sheet not rendered
  await userEvent.click(screen.getByRole('button', { name: /show full sheet/i }));
  expect(screen.getByTestId('marker')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /show beat ribbon/i }));
  expect(screen.getByTestId('ribbon')).toBeInTheDocument();
});

test('empty beats forces the sheet and hides the toggle', () => {
  vi.spyOn(videoTime, 'useVideoTime').mockReturnValue({ time: 5, adShowing: false });
  render(<Panel chart={chart as never} onCollapse={() => {}} />); // fixture has beats: []
  expect(screen.queryByTestId('ribbon')).toBeNull();
  expect(screen.getByTestId('marker')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /show/i })).toBeNull();
});

test('footer counts beats: next-in and beat N / M', () => {
  vi.spyOn(videoTime, 'useVideoTime').mockReturnValue({ time: 5, adShowing: false }); // in F (4-8s), beat 11 of grid
  render(<Panel chart={beatChart as never} onCollapse={() => {}} />);
  const footer = screen.getByText(/Now:/).closest('.tabit-footer')!;
  expect(footer).toHaveTextContent('Next: C in 6 beats'); // beats at 5.5..8.0
  expect(footer).toHaveTextContent('beat 3 / 8');          // F spans beats 8-15, t=5 is beats[10]
});

test('footer falls back to seconds without beats', () => {
  vi.spyOn(videoTime, 'useVideoTime').mockReturnValue({ time: 5, adShowing: false });
  render(<Panel chart={chart as never} onCollapse={() => {}} />);
  expect(screen.getByText(/Now:/).closest('.tabit-footer')).toHaveTextContent(/in 3\.0s/);
});

test('transpose relabels ribbon chord labels', async () => {
  vi.spyOn(videoTime, 'useVideoTime').mockReturnValue({ time: 0, adShowing: false });
  render(<Panel chart={beatChart as never} onCollapse={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /transpose up/i }));
  await userEvent.click(screen.getByRole('button', { name: /transpose up/i }));
  expect(screen.getByTestId('ribbon')).toHaveTextContent('Bm'); // Am +2
});
```

Also update the two existing tests that assume the sheet is the default view (`renders chords, marks current...` and `transpose relabels chords and the scales chip`): they keep using `chart` (beats: `[]`), which forces the sheet view — verify they still pass unchanged; if a selector broke because the chips section moved into the header, fix the selector, not the behavior.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run src/overlay/Panel.test.tsx`
Expected: new tests FAIL (no ribbon/toggle); old tests still pass.

- [ ] **Step 3: Restructure Panel.tsx**

Replace the header + chips section (lines 79–130) and wrap the two views. Complete new body of the return + the new state/derived values (the `decorated`/`rows`/auto-scroll code and sheet markup stay exactly as they are, just moved inside the `view === 'sheet'` branch):

```tsx
const hasBeats = chart.beats.length > 0;
const [view, setView] = useState<'ribbon' | 'sheet'>(hasBeats ? 'ribbon' : 'sheet');
const currentBeat = hasBeats ? beatIndexAt(chart.beats, time) : -1;
const nextStart = hasChords ? chords[nextIdx].start : 0;
const nextInBeats = hasBeats && hasChords ? beatsUntil(chart.beats, time, nextStart) : 0;
const beatN = hasBeats && hasChords ? beatWithinChord(chart.beats, chords[currentIndex], time) : 0;
const beatM = hasBeats && hasChords ? chordBeatSpan(chart.beats, chords[currentIndex]).beatCount : 0;
const isLast = hasChords && currentIndex === chords.length - 1;
```

```tsx
return (
  <div data-screen-label="Chord sheet" className="tabit-panel">
    <div className="tabit-panel-header tabit-panel-header-compact">
      <span className="tabit-panel-wordmark">tabIt</span>
      <span className="tabit-inline-chip">Key <b>{keyLabel}</b></span>
      <span className="tabit-inline-chip">{bpmLabel}</span>
      <span className="tabit-inline-chip tabit-inline-chip-scales">Solo: <b>{scalesLabel}</b></span>
      <div className="tabit-panel-header-right">
        {adShowing && <span className="tabit-ad-tag" data-testid="ad-tag">ad playing…</span>}
        <button type="button" className="tabit-round-btn" onClick={() => setTranspose((t) => Math.max(-6, t - 1))} aria-label="Transpose down">–</button>
        <span className="tabit-transpose-label">{transposeLabel}</span>
        <button type="button" className="tabit-round-btn" onClick={() => setTranspose((t) => Math.min(6, t + 1))} aria-label="Transpose up">+</button>
        <button type="button" className="tabit-round-btn" aria-label="Collapse" onClick={onCollapse}>▴</button>
      </div>
    </div>

    {view === 'ribbon' ? (
      <div className={adShowing ? 'tabit-sheet-dim' : ''}>
        <Ribbon
          beats={chart.beats}
          chords={decorated.map((d) => ({ start: d.start, end: d.end, label: d.label, quality: d.quality, low: d.low }))}
          currentBeat={currentBeat}
          currentChordIndex={currentIndex}
        />
      </div>
    ) : (
      /* existing sheet block, unchanged (tabit-sheet / margin / scroll / rows / marker) */
    )}

    {hasChords && (
      <div className="tabit-footer">
        <span>Now: <strong className="tabit-footer-strong">{currentLabel}</strong></span>
        <span className="tabit-footer-dot">·</span>
        <span>
          {isLast
            ? <>Next: — (to the end)</>
            : hasBeats
              ? <>Next: <strong className="tabit-footer-next-strong">{nextLabel}</strong> in {nextInBeats} beats</>
              : <>Next: <strong className="tabit-footer-next-strong">{nextLabel}</strong> in {nextIn.toFixed(1)}s</>}
        </span>
        {hasBeats && beatM > 0 && <span className="tabit-footer-beatcount">beat {beatN} / {beatM}</span>}
      </div>
    )}

    {hasBeats && (
      <button
        type="button"
        className="tabit-view-toggle"
        aria-label={view === 'ribbon' ? 'Show full sheet' : 'Show beat ribbon'}
        onClick={() => setView((v) => (v === 'ribbon' ? 'sheet' : 'ribbon'))}
      >
        {view === 'ribbon' ? '⌄ full sheet' : '⌃ beat ribbon'}
      </button>
    )}
  </div>
);
```

New imports: `import Ribbon from './Ribbon';` and `import { beatIndexAt, beatWithinChord, beatsUntil, chordBeatSpan } from '../../../web/src/lib/beats';`. Delete the `.tabit-chips-section` JSX (chips + transpose row) — the header now carries both. Update the Panel doc comment: delta 3 becomes the one-line header, and add delta 7 (ribbon default view + sheet toggle, spec 2026-07-10).

- [ ] **Step 4: Styles for the compact header, footer counter, toggle** (append to styles.ts; remove the now-unused `.tabit-chips-section`, `.tabit-chips`, `.tabit-chip`, `.tabit-chip-label`, `.tabit-chip-value`, `.tabit-chip-scales`, `.tabit-chip-scales-value`, `.tabit-transpose-row` rules)

```css
.tabit-panel-header-compact { display: flex; align-items: center; gap: 14px; padding: 8px 14px; }
.tabit-inline-chip { font-size: 12px; color: oklch(0.4 0.02 60); white-space: nowrap; }
.tabit-inline-chip b { color: oklch(0.25 0.02 60); font-weight: 600; }
.tabit-inline-chip-scales { overflow: hidden; text-overflow: ellipsis; }
.tabit-footer-beatcount { margin-left: auto; font-variant-numeric: tabular-nums; letter-spacing: 1px; }
.tabit-view-toggle {
  display: block; width: 100%; padding: 2px 0 8px; border: none; background: none;
  font: inherit; font-size: 11px; color: oklch(0.5 0.02 60); cursor: pointer; text-align: center;
}
.tabit-view-toggle:hover { color: oklch(0.3 0.02 60); }
```

Also cap the sheet inside the panel view: change `.tabit-sheet-scroll { max-height: 420px; }` to `max-height: min(420px, 38vh);` so even the full-sheet view fits under the player.

- [ ] **Step 5: Run Panel tests, then the full suite**

Run: `npx vitest run src/overlay/Panel.test.tsx` → all pass (new + updated old).
Run: `npm test && npm run typecheck && npm run build` → all green; note `dist/content.js` size in the report.

- [ ] **Step 6: Commit**

```bash
git add src/overlay/Panel.tsx src/overlay/Panel.test.tsx src/overlay/styles.ts
git commit -m "feat(ext): compact panel with beat ribbon default view and sheet toggle"
```

---

### Task 3: Live verification + docs (controller-driven)

**Files:**
- Modify: `docs/PROGRESS.md`, `README.md` (one line each)
- No new code except fixes surfaced.

- [ ] **Step 1: Full sweep** — root `pytest -q`; `web/`: `npm test`, `npx tsc -b --noEmit`; `extension/`: `npm test`, `npm run typecheck`, `npm run build`.

- [ ] **Step 2: Live headful check** — API running (`uvicorn api.main:app --port 8000`), then rerun the session's demo driver (scratchpad `e2e/demo.js`, Playwright bundled Chromium — NOT `channel: 'chrome'`, which ignores `--load-extension` since Chrome 137) against `TAWAL3LDzQ4` (cache-warm now). Verify at 1440×900: expanded panel fits below the player with no page scroll; amber advances beat-by-beat; labels match the sheet's; "⌄ full sheet" swaps views; transpose relabels ribbon; screenshot the result.

- [ ] **Step 3: Docs** — `docs/PROGRESS.md`: add under sub-project 3 `- [x] Beat ribbon compact view (spec 2026-07-10): beat-grid strip default, full sheet behind a toggle`. `README.md` extension section: append sentence `The expanded view is a Chordify-style beat ribbon — one cell per detected beat, so you can see the next chord change coming — with the full paper sheet one click away.`

- [ ] **Step 4: Commit** — `git add docs/PROGRESS.md README.md && git commit -m "docs: beat ribbon in progress ledger and README"`.

---

## Self-Review

**Spec coverage:** beats.ts four functions (T0) ✓; ribbon cells/labels/sweep/pips/bar-lines/fade/window/reduced-motion (T1) ✓; compact one-line header, view toggle default ribbon, beat footer with counter, empty-beats fallback to sheet + seconds footer, ad dim carry-over (T2) ✓; live under-player height check + docs (T3) ✓. Height budget ~170px realized by header 36px + ribbon 86px + footer ~28px + toggle ~20px ✓. Zero-beat chords: spec amended in Global Constraints (no cell, kept linear track) — deliberate, documented ✓.

**Placeholder scan:** the one elided block ("existing sheet block, unchanged") points at concrete existing code the implementer moves verbatim, with its exact class names restated in the DOM contract. No TBDs. ✓

**Type consistency:** `RibbonChord`/`RibbonProps` identical in T1 definition and T2 usage; `beats.ts` signatures match call sites (`beatIndexAt(chart.beats, time)` etc.); footer math reuses T0 functions only. Fixture `beatChart` beats 0–19.5s cover the 20s chords. Footer test numbers verified: t=5 → next C at 8.0 → beats 5.5,6.0,6.5,7.0,7.5,8.0 = 6; F spans 4–8s → beats 8..15 (8 beats), t=5 → beats[10] → within = 10−8+1 = 3. ✓
