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
