import { QUALITY_SUFFIX, transposeRoot } from '../../web/src/lib/music';

test('shared lib resolves across packages', () => {
  expect(QUALITY_SUFFIX.min7).toBe('m7');
  expect(transposeRoot('G#', 1)).toBe('A');
});

test('chrome stub present', () => {
  expect((globalThis as Record<string, unknown>).chrome).toBeDefined();
});
