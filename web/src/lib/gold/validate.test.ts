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
