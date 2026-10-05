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
