import { describe, expect, test } from 'vitest';
import { transposeRoot, formatLabel, findCurrentIndex } from './music';
import type { ChordSegment } from './types';

const seg = (start: number, end: number, root = 'A', quality = 'min', bass = 'A'): ChordSegment =>
  ({ start, end, label: '', root, quality, bass, confidence: 0.9 });

describe('transposeRoot', () => {
  test('wraps around', () => {
    expect(transposeRoot('A', 3)).toBe('C');
    expect(transposeRoot('G#', 1)).toBe('A');
    expect(transposeRoot('C', -1)).toBe('B');
  });
  test('N passes through', () => expect(transposeRoot('N', 4)).toBe('N'));
});

describe('formatLabel', () => {
  test('qualities from engine map', () => {
    expect(formatLabel('A', 'min', 'A', 0)).toBe('Am');
    expect(formatLabel('G', 'dom7', 'G', 0)).toBe('G7');
    expect(formatLabel('B', 'hdim7', 'B', 0)).toBe('Bm7b5');
  });
  test('slash chords transpose the bass too', () => {
    expect(formatLabel('C', 'maj', 'G', 0)).toBe('C/G');
    expect(formatLabel('C', 'maj', 'G', 2)).toBe('D/A');
  });
  test('no-chord renders as an em dash', () => {
    expect(formatLabel('N', 'N', 'N', 0)).toBe('—');
    expect(formatLabel('N', 'N', 'N', 3)).toBe('—');
  });
});

describe('findCurrentIndex', () => {
  const chords = [seg(0.5, 2), seg(2, 4), seg(4.5, 6)];
  test('before first chord -> 0', () => expect(findCurrentIndex(chords, 0)).toBe(0));
  test('inside a segment', () => expect(findCurrentIndex(chords, 3)).toBe(1));
  test('in a gap stays on previous', () => expect(findCurrentIndex(chords, 4.2)).toBe(1));
  test('past the end -> last', () => expect(findCurrentIndex(chords, 99)).toBe(2));
});
