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
    expect((row as HTMLElement).style.gridTemplateColumns).toBe('repeat(16, minmax(0, 1fr))');
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
  const chords = [chord({ index: 0, start: 0, end: 4, label: 'C', isEditing: true, edited: true })];
  const { getByRole } = render(
    <BeatGrid beats={beats} chords={chords} currentBeatIndex={0} {...baseCallbacks} />,
  );
  expect(getByRole('button', { name: /reset to detected/i })).toBeInTheDocument();
});

test('a long chord label does not widen its column - grid stays equal-width', () => {
  const beats = Array.from({ length: 4 }, (_, i) => i);
  const chords = [
    chord({ index: 0, start: 0, end: 1, label: 'F#m7b5/Bb' }),
    chord({ index: 1, start: 1, end: 4, label: 'C' }),
  ];
  const { container } = render(
    <BeatGrid beats={beats} chords={chords} currentBeatIndex={0} {...baseCallbacks} />,
  );
  const row = container.querySelector('[data-row]') as HTMLElement;
  // rowLen defaults to 16 (no meter passed) regardless of the long label's width.
  expect(row.style.gridTemplateColumns).toBe('repeat(16, minmax(0, 1fr))');
});

test('a chord that falls strictly between two beats still renders and is clickable', () => {
  const beats = [0, 1, 2, 3]; // 1s apart
  // start/end (1.2-1.8) sit strictly between beats[1]=1 and beats[2]=2, so
  // chordBeatSpan finds no beat boundary for it (firstBeat -1) - it must still
  // fall back onto its closest beat cell (beat 1) instead of disappearing.
  const chords = [chord({ index: 0, start: 1.2, end: 1.8, label: 'Dsus4' })];
  const onToggleEdit = vi.fn();
  const { getByRole, container } = render(
    <BeatGrid beats={beats} chords={chords} currentBeatIndex={0} {...baseCallbacks} onToggleEdit={onToggleEdit} />,
  );
  expect(container.querySelector('[data-beat-index="1"]')?.textContent).toBe('Dsus4');
  getByRole('button', { name: 'Dsus4' }).click();
  expect(onToggleEdit).toHaveBeenCalledWith(0);
});
