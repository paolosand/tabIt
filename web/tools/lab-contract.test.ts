// @vitest-environment node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { toLab } from '../src/lib/gold/lab.ts';
import { harteLabel } from '../src/lib/gold/degrees.ts';
import type { ChordChoice, Flag, GoldSpan } from '../src/lib/gold/types.ts';

const sp = (start: number, end: number, chord: ChordChoice, flag: Flag): GoldSpan =>
  ({ start, end, root: chord.root, quality: chord.quality, label: harteLabel(chord), flag, source: 'manual' });

// The Python side (tests/test_gold_contract.py) loads and scores this same file.
test('the exporter reproduces tests/fixtures/gold_sample.lab byte for byte', () => {
  const fixture = fs.readFileSync(
    fileURLToPath(new URL('../../tests/fixtures/gold_sample.lab', import.meta.url)), 'utf8',
  );
  const spans = [
    sp(2, 4, { root: 'A', quality: 'min' }, 'guess'),
    sp(4, 6, { root: 'F', quality: 'maj' }, 'guess'),
    sp(6, 8, { root: 'C', quality: 'maj' }, 'sure'),
  ];
  expect(toLab({ spans, duration: 12 }, 'labeled')).toBe(fixture);
});
