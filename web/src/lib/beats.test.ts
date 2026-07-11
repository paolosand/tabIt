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
