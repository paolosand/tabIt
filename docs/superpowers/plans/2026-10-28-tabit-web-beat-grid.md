# tabIt Web App — Wrapped Beat Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the web app's chord-sheet 4-column grid with a per-beat wrapped grid (16 beats/4 bars per row) whose current-beat cell sweeps through the song and auto-scrolls, matching the extension's beat-ribbon visual language.

**Architecture:** A new pure-renderer component (`BeatGrid.tsx`) takes the chart's `beats`/`downbeats`/`meter` plus `Sheet.tsx`'s existing per-chord decoration and renders one cell per beat, wrapped into fixed-width rows. `Sheet.tsx` keeps all its existing state (transpose, overrides, edit popover, playback time) and just swaps what it renders in place of the old grid, plus adds beat-index computation and scroll-follow logic.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library (existing web app stack, no new dependencies).

**Spec:** `docs/superpowers/specs/2026-10-28-tabit-web-beat-grid-design.md`

## Global Constraints

- Row length is `(meter?.beatsPerBar ?? 4) * 4` — 4 bars per row, honoring real detected meter (approved: 16 beats/row for a 4/4 song).
- Every row renders exactly `rowLen` CSS grid columns (`repeat(rowLen, 1fr)`) regardless of how many real cells land in a partial last row — column width must never depend on row content.
- Visual tokens for "now"/"done" come from the extension's brand tokens already in `DESIGN.md`: now = `oklch(0.88 0.14 90)` (amber), done = `oklch(0.965 0.012 90)` (muted wash).
- No change to `EditPopover.tsx`, the override/localStorage logic, transpose logic, or the header/video/chips section of `Sheet.tsx`.
- No change to `extension/` — the ribbon is the style reference, not a change target.

## Review Focus

- A chart with `beats.length === 0` (e.g. a short clip with no detected rhythm) — the existing `Sheet.test.tsx` fixture uses exactly this, and it must keep working via a one-cell-per-chord degraded mode, not render an empty grid.
- A chord count that doesn't divide evenly by `rowLen` — the partial last row must still have equal-width cells, not stretched ones.
- `currentBeatIndex` before playback starts (`beatIndexAt` returns `-1`) — no cell should render as "now" or "done".
- Manual scroll during playback must pause auto-scroll and resume after an idle window, not fight the user's scroll.
- Low-confidence dimming, the edited-override dot, and "N" (no-chord) handling must carry over unchanged from the old grid into the new cell layout — this is a port, not a new feature, and it's easy to silently drop one of these three in the rewrite.

---

### Task 1: `BeatGrid.tsx` — the per-beat grid component

**Files:**
- Create: `web/src/screens/BeatGrid.tsx`
- Create: `web/src/screens/BeatGrid.test.tsx`

**Interfaces:**
- Consumes: `chordBeatSpan(beats, chord: { start, end }): { firstBeat, beatCount }` from `web/src/lib/beats.ts` (existing, unchanged). `EditPopover` from `./EditPopover` (existing, unchanged props: `label, edited, onRootUp, onRootDown, onQuality, onReset, onClose`).
- Produces:
  ```ts
  export interface DecoratedChord {
    index: number;
    start: number;
    end: number;
    quality: string;
    label: string;
    isCurrent: boolean;
    isEditing: boolean;
    edited: boolean;
    fontSize: number;
    textColor: string;
    underline: string;
  }

  export interface BeatGridProps {
    beats: number[];
    downbeats?: number[];
    meter?: { beatsPerBar: number; confidence: number };
    chords: DecoratedChord[];
    currentBeatIndex: number;
    onToggleEdit: (index: number) => void;
    onRootUp: (index: number) => void;
    onRootDown: (index: number) => void;
    onQuality: (index: number, quality: string) => void;
    onReset: (index: number) => void;
    onCloseEdit: () => void;
  }

  export default function BeatGrid(props: BeatGridProps): JSX.Element
  ```
  Task 2 depends on these exact names/fields and the `data-beat-index` / `data-row` / `data-testid="beat-now"` / `data-testid="edited-dot"` attributes used in the tests below. `start`/`end` on `DecoratedChord` are not new data — `Sheet.tsx`'s existing `decorated` array already spreads them in from the raw chord (`...c`) — this just adds them to the type so `BeatGrid` can call `chordBeatSpan` directly on each chord, no parallel array needed.

- [ ] **Step 1: Write the failing tests**

```tsx
// web/src/screens/BeatGrid.test.tsx
import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import BeatGrid, { type DecoratedChord } from './BeatGrid';

function chord(over: Partial<DecoratedChord>): DecoratedChord {
  return {
    index: 0, start: 0, end: 0, quality: 'maj', label: 'C', isCurrent: false,
    isEditing: false, edited: false, fontSize: 26, textColor: 'oklch(0.28 0.02 70)',
    underline: '1.5px solid transparent', ...over,
  };
}

const noop = () => {};
const baseCallbacks = {
  onToggleEdit: noop, onRootUp: noop, onRootDown: noop,
  onQuality: noop, onReset: noop, onCloseEdit: noop,
};

test('one cell per beat; row wraps at (beatsPerBar * 4)', () => {
  const beats = Array.from({ length: 20 }, (_, i) => i); // 20 beats, 1s apart
  const chords = [
    chord({ index: 0, start: 0, end: 16, label: 'C', isCurrent: true }),
    chord({ index: 1, start: 16, end: 20, label: 'G' }),
  ];
  const { container } = render(
    <BeatGrid beats={beats} chords={chords} currentBeatIndex={0} meter={{ beatsPerBar: 4, confidence: 1 }} {...baseCallbacks} />,
  );
  const cells = container.querySelectorAll('[data-beat-index]');
  expect(cells.length).toBe(20);
  // 20 beats at rowLen 16 -> rows of 16 and 4; both rows render exactly rowLen=16
  // grid columns regardless of how many real cells they hold.
  const rows = container.querySelectorAll('[data-row]');
  expect(rows.length).toBe(2);
  rows.forEach((row) => {
    expect((row as HTMLElement).style.gridTemplateColumns).toBe('repeat(16, 1fr)');
  });
});

test('chord label renders once, on its first beat cell only', () => {
  const beats = Array.from({ length: 8 }, (_, i) => i);
  const chords = [
    chord({ index: 0, start: 0, end: 4, label: 'C' }),
    chord({ index: 1, start: 4, end: 8, label: 'G' }),
  ];
  const { container } = render(
    <BeatGrid beats={beats} chords={chords} currentBeatIndex={0} {...baseCallbacks} />,
  );
  const cells = container.querySelectorAll('[data-beat-index]');
  expect(cells[0].textContent).toBe('C');
  expect(cells[1].textContent).toBe('');
  expect(cells[4].textContent).toBe('G');
});

test('"N" chord renders its dash label as plain text, not a button', () => {
  const beats = Array.from({ length: 4 }, (_, i) => i);
  const chords = [chord({ index: 0, start: 0, end: 4, label: '—', quality: 'N' })];
  const { container } = render(
    <BeatGrid beats={beats} chords={chords} currentBeatIndex={0} {...baseCallbacks} />,
  );
  expect(container.querySelector('button')).toBeNull();
  expect(container.querySelector('[data-beat-index="0"]')?.textContent).toBe('—');
});

test('current beat cell is amber; earlier beats (including earlier rows) are washed', () => {
  const beats = Array.from({ length: 20 }, (_, i) => i);
  const chords = [chord({ index: 0, start: 0, end: 20, label: 'C', isCurrent: true })];
  const { container } = render(
    <BeatGrid beats={beats} chords={chords} currentBeatIndex={17} meter={{ beatsPerBar: 4, confidence: 1 }} {...baseCallbacks} />,
  );
  const now = container.querySelector('[data-testid="beat-now"]');
  expect(now?.getAttribute('data-beat-index')).toBe('17');
  expect((now as HTMLElement).style.background).toContain('0.88 0.14 90');
  const earlierInRow = container.querySelector('[data-beat-index="16"]') as HTMLElement;
  expect(earlierInRow.style.background).toContain('0.965 0.012 90');
  const earlierRow = container.querySelector('[data-beat-index="0"]') as HTMLElement;
  expect(earlierRow.style.background).toContain('0.965 0.012 90');
  const future = container.querySelector('[data-beat-index="18"]') as HTMLElement;
  expect(future.style.background).not.toContain('0.88 0.14 90');
  expect(future.style.background).not.toContain('0.965 0.012 90');
});

test('before playback starts (currentBeatIndex -1), no cell is now or done', () => {
  const beats = Array.from({ length: 4 }, (_, i) => i);
  const chords = [chord({ index: 0, start: 0, end: 4, label: 'C', isCurrent: true })];
  const { container } = render(
    <BeatGrid beats={beats} chords={chords} currentBeatIndex={-1} {...baseCallbacks} />,
  );
  expect(container.querySelector('[data-testid="beat-now"]')).toBeNull();
  container.querySelectorAll('[data-beat-index]').forEach((c) => {
    expect((c as HTMLElement).style.background).not.toContain('0.965 0.012 90');
  });
});

test('degraded mode (no beats): one cell per chord, current chord is now, earlier chords are done', () => {
  const chords = [
    chord({ index: 0, label: 'C' }),
    chord({ index: 1, label: 'F', isCurrent: true }),
    chord({ index: 2, label: 'G' }),
  ];
  const { container } = render(
    <BeatGrid beats={[]} chords={chords} currentBeatIndex={-1} {...baseCallbacks} />,
  );
  const cells = container.querySelectorAll('[data-beat-index]');
  expect(cells.length).toBe(3);
  expect(cells[1].getAttribute('data-testid')).toBe('beat-now');
  expect((cells[0] as HTMLElement).style.background).toContain('0.965 0.012 90');
  expect((cells[2] as HTMLElement).style.background).not.toContain('0.965 0.012 90');
  expect((cells[2] as HTMLElement).style.background).not.toContain('0.88 0.14 90');
});

test('low-confidence underline and edited dot carry over to the new cell', () => {
  const beats = Array.from({ length: 4 }, (_, i) => i);
  const chords = [
    chord({
      index: 0, start: 0, end: 4, label: 'C', edited: true,
      underline: '1.5px dotted oklch(0.52 0.02 70)', textColor: 'oklch(0.52 0.02 70)',
    }),
  ];
  const { container, getByRole } = render(
    <BeatGrid beats={beats} chords={chords} currentBeatIndex={0} {...baseCallbacks} />,
  );
  const btn = getByRole('button', { name: 'C' });
  expect(btn.style.borderBottom).toBe('1.5px dotted oklch(0.52 0.02 70)');
  expect(btn.style.color).toBe('oklch(0.52 0.02 70)');
  expect(container.querySelector('[data-testid="edited-dot"]')).not.toBeNull();
});

test('clicking a chord label calls onToggleEdit with its index', async () => {
  const beats = Array.from({ length: 4 }, (_, i) => i);
  const chords = [chord({ index: 2, start: 0, end: 4, label: 'C' })];
  const onToggleEdit = vi.fn();
  const { getByRole } = render(
    <BeatGrid beats={beats} chords={chords} currentBeatIndex={0} {...baseCallbacks} onToggleEdit={onToggleEdit} />,
  );
  getByRole('button', { name: 'C' }).click();
  expect(onToggleEdit).toHaveBeenCalledWith(2);
});

test('isEditing renders the EditPopover for that cell', () => {
  const beats = Array.from({ length: 4 }, (_, i) => i);
  const chords = [chord({ index: 0, start: 0, end: 4, label: 'C', isEditing: true })];
  const { getByRole } = render(
    <BeatGrid beats={beats} chords={chords} currentBeatIndex={0} {...baseCallbacks} />,
  );
  expect(getByRole('button', { name: /reset to detected/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/screens/BeatGrid.test.tsx`
Expected: FAIL — `Cannot find module './BeatGrid'`

- [ ] **Step 3: Write the implementation**

```tsx
// web/src/screens/BeatGrid.tsx
import { chordBeatSpan } from '../lib/beats';
import EditPopover from './EditPopover';

export interface DecoratedChord {
  index: number;
  start: number;
  end: number;
  quality: string;
  label: string;
  isCurrent: boolean;
  isEditing: boolean;
  edited: boolean;
  fontSize: number;
  textColor: string;
  underline: string;
}

export interface BeatGridProps {
  beats: number[];
  downbeats?: number[];
  meter?: { beatsPerBar: number; confidence: number };
  chords: DecoratedChord[];
  currentBeatIndex: number;
  onToggleEdit: (index: number) => void;
  onRootUp: (index: number) => void;
  onRootDown: (index: number) => void;
  onQuality: (index: number, quality: string) => void;
  onReset: (index: number) => void;
  onCloseEdit: () => void;
}

interface Cell {
  beatIndex: number;
  chord?: DecoratedChord;
  isBarStart: boolean;
  isNow: boolean;
  isDone: boolean;
}

function buildCells({ beats, downbeats, meter, chords, currentBeatIndex }: BeatGridProps): Cell[] {
  if (beats.length === 0) {
    // Degraded mode: no beat grid on this chart (e.g. a very short clip with no
    // detected rhythm) - one cell per chord instead of one per beat, same visual
    // language, no per-beat sweep since there's nothing to sweep through.
    const curIdx = chords.findIndex((c) => c.isCurrent);
    return chords.map((c, i) => ({
      beatIndex: i,
      chord: c,
      isBarStart: false,
      isNow: c.isCurrent,
      isDone: curIdx >= 0 && i < curIdx,
    }));
  }

  const downbeatSet = new Set(downbeats ?? []);
  const beatsPerBar = meter?.beatsPerBar ?? 4;
  const beatChord = new Array<DecoratedChord | undefined>(beats.length).fill(undefined);
  chords.forEach((c) => {
    const { firstBeat, beatCount } = chordBeatSpan(beats, c);
    for (let b = firstBeat; b >= 0 && b < firstBeat + beatCount; b++) beatChord[b] = c;
  });

  return beats.map((t, b) => {
    const chord = beatChord[b];
    const isChordStart = !!chord && chordBeatSpan(beats, chord).firstBeat === b;
    return {
      beatIndex: b,
      chord: isChordStart ? chord : undefined,
      isBarStart: downbeatSet.size > 0 ? downbeatSet.has(t) : b % beatsPerBar === 0,
      isNow: b === currentBeatIndex,
      isDone: currentBeatIndex >= 0 && b < currentBeatIndex,
    };
  });
}

export default function BeatGrid(props: BeatGridProps) {
  const { meter, onToggleEdit, onRootUp, onRootDown, onQuality, onReset, onCloseEdit } = props;
  const rowLen = (meter?.beatsPerBar ?? 4) * 4;
  const cells = buildCells(props);

  const rows: Cell[][] = [];
  for (let i = 0; i < cells.length; i += rowLen) rows.push(cells.slice(i, i + rowLen));

  return (
    <div>
      {rows.map((row, ri) => (
        <div
          key={ri}
          data-row={ri}
          style={{ display: 'grid', gridTemplateColumns: `repeat(${rowLen}, 1fr)` }}
        >
          {row.map((cell) => (
            <div
              key={cell.beatIndex}
              data-beat-index={cell.beatIndex}
              data-testid={cell.isNow ? 'beat-now' : undefined}
              style={{
                position: 'relative',
                minHeight: 60,
                padding: 8,
                boxSizing: 'border-box',
                borderLeft: cell.isBarStart ? '2px solid oklch(0.82 0.012 90)' : '1px solid oklch(0.93 0.008 90)',
                borderBottom: '1px solid oklch(0.93 0.008 90)',
                background: cell.isNow
                  ? 'oklch(0.88 0.14 90)'
                  : cell.isDone
                    ? 'oklch(0.965 0.012 90)'
                    : 'transparent',
                borderRadius: cell.isNow ? 4 : 0,
              }}
            >
              {cell.chord && cell.chord.quality === 'N' && (
                <span
                  style={{
                    fontFamily: "'Fraunces', serif", fontWeight: 600,
                    fontSize: cell.chord.fontSize, color: 'oklch(0.52 0.02 70)',
                  }}
                >
                  {cell.chord.label}
                </span>
              )}
              {cell.chord && cell.chord.quality !== 'N' && (
                <>
                  <button
                    onClick={() => onToggleEdit(cell.chord!.index)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      fontFamily: "'Fraunces', serif", fontWeight: 600,
                      fontSize: cell.chord.fontSize, color: cell.chord.textColor,
                      borderBottom: cell.chord.underline, paddingBottom: 3,
                    }}
                  >
                    {cell.chord.label}
                  </button>
                  {cell.chord.edited && (
                    <span
                      data-testid="edited-dot"
                      style={{
                        position: 'absolute', top: 6, right: 6, width: 5, height: 5,
                        borderRadius: '50%', background: 'oklch(0.70 0.10 25)',
                      }}
                    />
                  )}
                  {cell.chord.isEditing && (
                    <EditPopover
                      label={cell.chord.label}
                      edited={cell.chord.edited}
                      onRootUp={() => onRootUp(cell.chord!.index)}
                      onRootDown={() => onRootDown(cell.chord!.index)}
                      onQuality={(q) => onQuality(cell.chord!.index, q)}
                      onReset={() => onReset(cell.chord!.index)}
                      onClose={onCloseEdit}
                    />
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/screens/BeatGrid.test.tsx`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Typecheck and commit**

```bash
cd web && npx tsc -b
git add web/src/screens/BeatGrid.tsx web/src/screens/BeatGrid.test.tsx
git commit -m "feat(web): add BeatGrid, a per-beat wrapped-row chord grid"
```

---

### Task 2: Wire `BeatGrid` into `Sheet.tsx`

**Files:**
- Modify: `web/src/screens/Sheet.tsx`
- Modify: `web/src/screens/Sheet.test.tsx`

**Interfaces:**
- Consumes: `BeatGrid`, `DecoratedChord` from `./BeatGrid` (Task 1, exact shape above). `beatIndexAt` from `../lib/beats` (existing).
- Produces: nothing new consumed elsewhere — `Sheet.tsx` is the top-level screen.

- [ ] **Step 1: Write the new/updated failing tests**

Replace the `marker`-based assertion and add two new tests. In `web/src/screens/Sheet.test.tsx`, change the first test and append two more:

```tsx
test('renders chords, marks current, N is a dash', () => {
  vi.spyOn(playback, 'usePlaybackTime').mockReturnValue(5); // inside F
  render(<Sheet chart={chart as never} mediaFile={null} onBack={() => {}} />);
  expect(screen.getByText('Am')).toBeInTheDocument();
  expect(screen.getByText('—')).toBeInTheDocument();
  expect(screen.getByTestId('beat-now').textContent).toBe('F');
  expect(screen.getByText(/Now:/).parentElement).toHaveTextContent('F');
});
```

```tsx
const chartWithBeats = {
  ...chart,
  beats: Array.from({ length: 20 }, (_, i) => i), // 1 beat/sec, 0..19s
  meter: { beatsPerBar: 4, confidence: 1 },
};

test('sweeps per beat when the chart has real beat data', () => {
  vi.spyOn(playback, 'usePlaybackTime').mockReturnValue(6); // beat index 6, inside F (chord start 4)
  render(<Sheet chart={chartWithBeats as never} mediaFile={null} onBack={() => {}} />);
  const now = screen.getByTestId('beat-now');
  expect(now.getAttribute('data-beat-index')).toBe('6');
});

test('manual scroll pauses auto-scroll for the idle window', () => {
  vi.useFakeTimers();
  vi.spyOn(playback, 'usePlaybackTime').mockReturnValue(6);
  render(<Sheet chart={chartWithBeats as never} mediaFile={null} onBack={() => {}} />);
  const scrollArea = screen.getByTestId('beat-now').closest('[data-scroll-area]') as HTMLElement;
  const scrollIntoViewSpy = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoViewSpy;
  scrollArea.dispatchEvent(new Event('scroll'));
  vi.advanceTimersByTime(1000);
  // still within the 3s idle window - auto-scroll must not have fired again
  expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/screens/Sheet.test.tsx`
Expected: FAIL — `getByTestId('beat-now')` finds nothing (old grid still renders `marker`), new tests fail for the same reason.

- [ ] **Step 3: Replace the grid rendering and scroll logic**

In `web/src/screens/Sheet.tsx`:

1. Update imports: remove the now-unused `EditPopover` import (it's only used inside `BeatGrid` from here on), add `beatIndexAt` and `BeatGrid`:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { Chart, ChordSegment } from '../lib/types';
import { findCurrentIndex, formatLabel, transposeRoot, transposeScaleName } from '../lib/music';
import { beatIndexAt } from '../lib/beats';
import { chartKey, loadOverrides, saveOverrides, type Overrides } from '../lib/overrides';
import YouTubePlayer from '../playback/YouTubePlayer';
import AudioPlayer from '../playback/AudioPlayer';
import { usePlaybackTime, type PlaybackSource } from '../playback/usePlaybackTime';
import BeatGrid from './BeatGrid';
```

2. Delete `const HIGHLIGHT_COLOR = 'oklch(0.90 0.12 92)';` (line 17) — no longer used.

3. Delete `const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});` (line 25) — replaced by `data-beat-index` lookup.

4. After the existing `const currentIndex = findCurrentIndex(chords, time);` line, add:

```tsx
  const currentBeatIndex = beatIndexAt(chart.beats, time);
```

5. Delete the `rows` construction block (old lines ~102–105: the `const rows: {...}[] = []; for (...) rows.push(...)`) — no longer needed, `BeatGrid` does its own row wrapping.

6. Replace the scroll-follow `useEffect` (old lines ~107–117) with manual-scroll-aware auto-scroll:

```tsx
  const lastManualScrollAt = useRef(0);
  const programmaticScroll = useRef(false);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onScroll = () => {
      if (programmaticScroll.current) {
        programmaticScroll.current = false;
        return;
      }
      lastManualScrollAt.current = Date.now();
    };
    container.addEventListener('scroll', onScroll);
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (Date.now() - lastManualScrollAt.current < 3000) return;
    const container = scrollRef.current;
    const cell = container?.querySelector(`[data-beat-index="${currentBeatIndex}"]`);
    if (cell) {
      programmaticScroll.current = true;
      cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentBeatIndex]);
```

7. Replace the whole card block that renders the old grid (old lines ~303–445, from the `<div style={{ background: 'oklch(0.988 0.006 85)', ... }}>` through its closing `</div>` that wraps the margin line, the `editingIndex` backdrop, and the `scrollRef` grid) with:

```tsx
      <div
        style={{
          background: 'oklch(0.988 0.006 85)',
          borderRadius: 4,
          boxShadow: '0 1px 2px oklch(0.28 0.02 70 / 0.05), 0 10px 30px oklch(0.28 0.02 70 / 0.06)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 52,
            top: 0,
            bottom: 0,
            width: 1.5,
            background: 'oklch(0.70 0.10 25 / 0.5)',
            zIndex: 1,
          }}
        />
        {editingIndex !== null && (
          <div onClick={closeEditing} style={{ position: 'fixed', inset: 0, zIndex: 15 }} />
        )}
        <div
          ref={scrollRef}
          data-scroll-area
          style={{
            maxHeight: 420,
            overflowY: 'auto',
            padding: '26px 30px 26px 76px',
            scrollBehavior: 'smooth',
          }}
        >
          <BeatGrid
            beats={chart.beats}
            downbeats={chart.downbeats}
            meter={chart.meter}
            currentBeatIndex={currentBeatIndex}
            chords={decorated}
            onToggleEdit={toggleEdit}
            onRootUp={(i) => nudgeRoot(i, 1)}
            onRootDown={(i) => nudgeRoot(i, -1)}
            onQuality={applyQuality}
            onReset={clearOverride}
            onCloseEdit={closeEditing}
          />
        </div>
      </div>
```

`decorated` (built just above, unchanged) already spreads `...c` from each raw chord plus `index, label, isCurrent, isNext, edited, isEditing, fontSize, textColor, underline` — so it already has `start`/`end`/`quality` from the spread and satisfies `DecoratedChord` exactly; no reshaping needed at the call site.

8. The footer block (old lines ~447–467, "Now: / Next:") is unchanged — it already reads `currentLabel`/`nextLabel`/`nextIn` which don't depend on anything removed above.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/screens/Sheet.test.tsx`
Expected: PASS (8 tests: the 5 original plus the 2 new ones plus the updated first one)

Then run the full web suite to catch any other file referencing the removed `marker` testid or `HIGHLIGHT_COLOR`:

Run: `cd web && npx vitest run`
Expected: PASS, all files

- [ ] **Step 5: Typecheck, build, and commit**

```bash
cd web && npx tsc -b && npm run build
git add web/src/screens/Sheet.tsx web/src/screens/Sheet.test.tsx
git commit -m "feat(web): replace the chord-sheet grid with the per-beat BeatGrid"
```

---

### Task 3: Reconcile `DESIGN.md`

**Files:**
- Modify: `DESIGN.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Update the Highlighter / signature-moment language**

In the `## Color` table, the `Highlighter` row's **Use** column currently reads "warm amber marker behind the CURRENT chord" — change to:

```
| Highlighter | `oklch(0.90 0.12 92)` | the EditPopover "edited" indicator and other small accent marks; no longer the current-chord highlight (see beat grid, below) |
```

In `## Signature moments`, replace the first bullet:

```
- The amber **highlighter sweep** landing on the current chord as the song plays.
```

with:

```
- The amber beat cell sweeping through the song's wrapped beat grid (web app and
  extension both use this now — see "Amber (progress)" above and
  `docs/superpowers/specs/2026-10-28-tabit-web-beat-grid-design.md`).
```

- [ ] **Step 2: Verify the doc still reads coherently**

Read the full file back and confirm no other section still describes the rotated-sticker highlighter as the current behavior (search for "sticker", "rotate", "marker").

```bash
grep -n -i "sticker\|rotate(-0.6\|highlighter sweep" DESIGN.md
```

Expected: only the updated bullet above matches (if any), no stale description remains.

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md
git commit -m "docs: reconcile DESIGN.md with the wrapped beat-grid replacing the sticker highlighter"
```

---

## Self-Review Notes

- **Spec coverage:** Problem/Decision → Tasks 1–2 (component + wiring). `DESIGN.md` reconciliation → Task 3. Equal-spacing requirement → Task 1 Step 1 test 1 + the `repeat(rowLen, 1fr)` constraint called out in Global Constraints. Manual-scroll-then-resume → Task 2 Step 1's third test. "Extension untouched" → no task modifies `extension/`.
- **Type consistency (fixed during self-review):** the first draft of this plan had `BeatGrid` take a separate `spans` prop (parallel to `chords`, same length/order) to get at each chord's `start`/`end`, because `DecoratedChord` didn't declare them — but `Sheet.tsx`'s existing `decorated` array already carries `start`/`end` via its `...c` spread. Declaring `start`/`end` directly on `DecoratedChord` removes the parallel-array indirection (and the index-alignment bug risk that came with it) entirely; `BeatGrid` now calls `chordBeatSpan(beats, chord)` straight on each decorated chord. `DecoratedChord`/`BeatGridProps` are defined once in Task 1 and used identically in Task 1's tests and Task 2's call site.
- **Review Focus coverage:** all five items each have a named test in Task 1 or Task 2 above (empty beats → Task 1's degraded-mode test + Task 2's untouched existing fixture; uneven row length → Task 1's wrap test; pre-playback `-1` index → Task 1's dedicated test; manual-scroll pause → Task 2's fake-timer test; low-confidence/edited/N parity → Task 1's dedicated test).
