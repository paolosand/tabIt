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
