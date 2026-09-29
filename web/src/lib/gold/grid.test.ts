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
