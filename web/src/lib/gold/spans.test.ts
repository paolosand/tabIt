import { expect, test } from 'vitest';
import { harteLabel } from './degrees.ts';
import {
  clearAt, computeGhosts, confirmGhost, placeChord, retoneAt, spanAt, transposeSpans,
  type PlaceOpts,
} from './spans.ts';
import type { ChordChoice, EngineChord, Flag, GoldSpan, Provenance } from './types.ts';

const am: ChordChoice = { root: 'A', quality: 'min' };
const f: ChordChoice = { root: 'F', quality: 'maj' };
const g: ChordChoice = { root: 'G', quality: 'maj' };

const eng = (start: number, end: number, root: string, quality: string): EngineChord =>
  ({ start, end, root, quality, label: root, confidence: 0.5 });
const ENGINE = [eng(0, 4, 'A', 'min'), eng(4, 8, 'F', 'maj'), eng(8, 12, 'C', 'maj')];

const span = (start: number, end: number, chord: ChordChoice, flag: Flag = 'guess', source: Provenance = 'manual'): GoldSpan =>
  ({ start, end, root: chord.root, quality: chord.quality, label: harteLabel(chord), flag, source });

const opts = (t: number, chord: ChordChoice, extra: Partial<PlaceOpts> = {}): PlaceOpts =>
  ({ t, chord, barEnd: t + 2, duration: 16, tol: 0.2, autoExtendMax: 8, ...extra });

test('computeGhosts: engine chords minus placed spans; blind hides them', () => {
  expect(computeGhosts(ENGINE, [], false).map((x) => [x.start, x.end, x.chord.root])).toEqual([
    [0, 4, 'A'], [4, 8, 'F'], [8, 12, 'C'],
  ]);
  const cut = computeGhosts(ENGINE, [span(2, 4, am)], false);
  expect(cut.map((x) => [x.start, x.end])).toEqual([[0, 2], [4, 8], [8, 12]]);
  const across = computeGhosts(ENGINE, [span(3, 9, g)], false);
  expect(across.map((x) => [x.start, x.end])).toEqual([[0, 3], [9, 12]]); // F fully covered
  expect(computeGhosts(ENGINE, [], true)).toEqual([]);
});

test('spanAt: boundary belongs to the later span', () => {
  const spans = [span(0, 4, am), span(4, 8, f)];
  expect(spanAt(spans, 0)?.label).toBe('A:min');
  expect(spanAt(spans, 4)?.label).toBe('F:maj');
  expect(spanAt(spans, 3.9999999)?.label).toBe('F:maj'); // float noise at the boundary
  expect(spanAt(spans, 8)).toBeUndefined();
});

test('placing on a ghost start: same chord = confirmed, different = edited, over the ghost extent', () => {
  const ghosts = computeGhosts(ENGINE, [], false);
  const same = placeChord([], ghosts, opts(4, f));
  expect(same).toEqual([{ ...span(4, 8, f), source: 'confirmed' }]);
  const diff = placeChord([], ghosts, opts(4, g));
  expect(diff).toEqual([{ ...span(4, 8, g), source: 'edited' }]);
});

test('placing mid-ghost splits: new span runs to the ghost end, the head stays a ghost', () => {
  const ghosts = computeGhosts(ENGINE, [], false);
  const out = placeChord([], ghosts, opts(5, g));
  expect(out).toEqual([{ ...span(5, 8, g), source: 'edited' }]);
  const after = computeGhosts(ENGINE, out, false);
  expect(after.map((x) => [x.start, x.end, x.chord.root])).toEqual([[0, 4, 'A'], [4, 5, 'F'], [8, 12, 'C']]);
});

test('placing on an existing span start replaces it; confirmed→edited only when the chord changes', () => {
  const spans = [span(0, 4, am, 'guess', 'confirmed')];
  const changed = placeChord(spans, [], opts(0, g));
  expect(changed).toEqual([{ ...span(0, 4, g), source: 'edited' }]);
  const same = placeChord(spans, [], opts(0, am));
  expect(same[0].source).toBe('confirmed');
});

test('placing mid-span splits: head keeps its label (confirmed→edited), tail is edited (or manual)', () => {
  const confirmed = [span(0, 8, am, 'guess', 'confirmed')];
  expect(placeChord(confirmed, [], opts(3, f))).toEqual([
    { ...span(0, 3, am), source: 'edited' },
    { ...span(3, 8, f), source: 'edited' },
  ]);
  const manual = [span(0, 8, am, 'guess', 'manual')];
  expect(placeChord(manual, [], opts(3, f))).toEqual([span(0, 3, am), span(3, 8, f)]);
});

test('empty region: default length is the rest of the bar, capped by the next span', () => {
  expect(placeChord([], [], opts(2, f, { barEnd: 4 }))).toEqual([span(2, 4, f)]);
  const withNext = placeChord([span(3, 6, am)], [], opts(2, f, { barEnd: 4 }));
  expect(withNext.map((s) => [s.start, s.end])).toEqual([[2, 3], [3, 6]]);
});

test('a later chord auto-extends the preceding span across a gap, up to the cap', () => {
  const before = [span(0, 2, am)];
  const extended = placeChord(before, [], opts(6, f, { barEnd: 8, autoExtendMax: 8 }));
  expect(extended.map((s) => [s.start, s.end, s.label])).toEqual([[0, 6, 'A:min'], [6, 8, 'F:maj']]);
  const capped = placeChord(before, [], opts(6, f, { barEnd: 8, autoExtendMax: 3 })); // gap is 4 > 3
  expect(capped.map((s) => [s.start, s.end])).toEqual([[0, 2], [6, 8]]);
});

test('no auto-extend across unreviewed engine chords in the gap', () => {
  const before = [span(0, 2, am)];
  const ghosts = [{ start: 3, end: 5, chord: am }];
  const out = placeChord(before, ghosts, opts(6, f, { barEnd: 8 }));
  expect(out.map((s) => [s.start, s.end])).toEqual([[0, 2], [6, 8]]);
});

test('placing at or after the end of the song is a no-op (Review Focus 5)', () => {
  const spans = [span(0, 2, am)];
  expect(placeChord(spans, [], opts(16, f))).toBe(spans);
  expect(placeChord(spans, [], opts(99, f))).toBe(spans);
  expect(placeChord(spans, [], opts(-1, f))).toBe(spans);
  const tail = placeChord(spans, [], opts(15.9, f, { barEnd: 18 }));
  expect(tail[1].end).toBe(16); // clamped to the duration
});

test('X and N marks: X is flag skip / label X, N keeps guess', () => {
  const x = placeChord([], [], opts(2, { root: null, quality: 'X' }, { barEnd: 4 }));
  expect(x).toEqual([{ start: 2, end: 4, root: null, quality: 'X', label: 'X', flag: 'skip', source: 'manual' }]);
  const n = placeChord([], [], opts(2, { root: 'N', quality: 'N' }, { barEnd: 4 }));
  expect(n[0]).toMatchObject({ label: 'N', flag: 'guess' });
});

test('confirmGhost turns the ghost under t into a confirmed guess and reports where to go next', () => {
  const ghosts = computeGhosts(ENGINE, [], false);
  const r = confirmGhost([], ghosts, 5);
  expect(r?.next).toBe(8);
  expect(r?.spans).toEqual([{ ...span(4, 8, f), source: 'confirmed' }]);
  expect(confirmGhost([], [], 5)).toBeNull();
});

test('clearAt removes the span under t (the engine ghost reappears); no-op returns the same array', () => {
  const spans = [span(4, 8, g, 'guess', 'edited')];
  const cleared = clearAt(spans, 5);
  expect(cleared).toEqual([]);
  expect(computeGhosts(ENGINE, cleared, false).some((x) => x.start === 4 && x.chord.root === 'F')).toBe(true);
  expect(clearAt(spans, 1)).toBe(spans);
});

test('retoneAt: toggles the chord under t over its full extent; unchanged returns the same array', () => {
  const ghosts = computeGhosts(ENGINE, [], false);
  const base = { barEnd: 4, duration: 16, tol: 0.2, autoExtendMax: 8 };
  const fromGhost = retoneAt([], ghosts, 5, 'd', base);
  expect(fromGhost).toEqual([{ ...span(4, 8, { root: 'F', quality: 'dom7' }), source: 'edited' }]);
  const spans = [span(4, 8, g, 'guess', 'confirmed')];
  const minor = retoneAt(spans, [], 5, 'm', base);
  expect(minor).toEqual([{ ...span(4, 8, { root: 'G', quality: 'min' }), source: 'edited' }]);
  const n = [span(0, 2, { root: 'N', quality: 'N' })];
  expect(retoneAt(n, [], 1, 'm', base)).toBe(n);
  expect(retoneAt([], [], 1, 'm', base)).toEqual([]);
});

test('transposeSpans shifts roots and relabels; X and N are untouched', () => {
  const spans = [span(0, 2, am), span(2, 4, { root: 'N', quality: 'N' }), span(4, 6, { root: null, quality: 'X' }, 'skip')];
  const up = transposeSpans(spans, 2);
  expect(up[0]).toMatchObject({ root: 'B', label: 'B:min' });
  expect(up[1]).toBe(spans[1]);
  expect(up[2]).toBe(spans[2]);
  expect(transposeSpans(spans, 12)).toBe(spans);
});
