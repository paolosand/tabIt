import { expect, test } from 'vitest';
import { sampleGold } from '../lib/gold/sample.ts';
import type { GoldFile } from '../lib/gold/types.ts';
import { initState, reduce, UNDO_LIMIT, type Action, type AnnotatorState } from './annotatorReducer.ts';

// sampleGold: 24 beats at 0.5 s, 4 beats/bar, C major; engine chords Am 0–4, F 4–8, C 8–12.
const run = (state: AnnotatorState, ...actions: Action[]) => actions.reduce(reduce, state);
const start = (over: Partial<GoldFile> = {}) => initState(sampleGold(over));
const labels = (s: AnnotatorState) => s.file.spans.map((x) => `${x.start}-${x.end} ${x.label} ${x.source}`);

test('digit on a ghost start confirms when it matches the engine, edits when it does not', () => {
  const same = run(start(), { type: 'digit', digit: 6 }); // Am at t=0 = engine's Am
  expect(labels(same)).toEqual(['0-4 A:min confirmed']);
  const diff = run(start(), { type: 'digit', digit: 5 }); // G over the Am ghost
  expect(labels(diff)).toEqual(['0-4 G:maj edited']);
});

test('digit mid-ghost splits; the cursor stays put', () => {
  const s = run(start(), { type: 'setCursor', beat: 2 }, { type: 'digit', digit: 4 }); // t = 1.0
  expect(labels(s)).toEqual(['1-4 F:maj edited']);
  expect(s.cursor).toBe(2);
});

test('flat prefix applies to exactly one digit', () => {
  const s = run(start(), { type: 'flatPrefix' }, { type: 'digit', digit: 7 });
  expect(labels(s)).toEqual(['0-4 A#:maj edited']);
  expect(s.flatPending).toBe(false);
  const t = run(s, { type: 'setCursor', beat: 8 }, { type: 'digit', digit: 7 }); // no prefix now
  expect(labels(t)[1]).toBe('4-8 B:min edited');
});

test('toggle retones the chord under the cursor; mark places N and X', () => {
  const s = run(start(), { type: 'toggle', which: 'd' }); // Am ghost → Am7
  expect(labels(s)).toEqual(['0-4 A:min7 edited']);
  const n = run(start(), { type: 'mark', kind: 'N' });
  expect(labels(n)).toEqual(['0-4 N edited']);
  const x = run(start(), { type: 'mark', kind: 'X' });
  expect(x.file.spans[0]).toMatchObject({ label: 'X', flag: 'skip' });
});

test('Enter confirms the ghost and advances to the next chip; on an existing span it just advances', () => {
  const s = run(start(), { type: 'confirm' });
  expect(labels(s)).toEqual(['0-4 A:min confirmed']);
  expect(s.cursor).toBe(8); // t = 4.0 → beat 8
  const t = run(s, { type: 'confirm' });
  expect(labels(t)).toEqual(['0-4 A:min confirmed', '4-8 F:maj confirmed']);
  const back = run(t, { type: 'setCursor', beat: 0 }, { type: 'confirm' }); // already labeled
  expect(back.file.spans).toBe(t.file.spans);
  expect(back.cursor).toBe(8);
});

test('clear removes the span under the cursor', () => {
  const s = run(start(), { type: 'digit', digit: 6 }, { type: 'clear' });
  expect(s.file.spans).toEqual([]);
});

test('undo/redo restore spans; a new edit clears the redo stack; history is capped', () => {
  let s = run(start(), { type: 'digit', digit: 6 }, { type: 'setCursor', beat: 8 }, { type: 'digit', digit: 4 });
  expect(s.file.spans).toHaveLength(2);
  s = run(s, { type: 'undo' });
  expect(s.file.spans).toHaveLength(1);
  s = run(s, { type: 'redo' });
  expect(s.file.spans).toHaveLength(2);
  s = run(s, { type: 'undo' }, { type: 'undo' });
  expect(s.file.spans).toHaveLength(0);
  expect(run(s, { type: 'undo' })).toBe(s); // nothing left to undo
  s = run(s, { type: 'digit', digit: 6 });
  expect(s.future).toEqual([]);

  // history cap
  let big = start();
  for (let i = 0; i < UNDO_LIMIT + 20; i++) big = run(big, { type: 'digit', digit: i % 2 ? 6 : 5 });
  expect(big.past.length).toBeLessThanOrEqual(UNDO_LIMIT);
});

test('cursor movement clamps to the grid; rows are 4 bars', () => {
  let s = start();
  expect(run(s, { type: 'moveCursor', delta: -5 }).cursor).toBe(0);
  s = run(s, { type: 'moveCursor', delta: 3 });
  expect(s.cursor).toBe(3);
  expect(run(s, { type: 'moveRow', dir: 1 }).cursor).toBe(19); // +16
  expect(run(s, { type: 'setCursor', beat: 999 }).cursor).toBe(23);
});

test('grid controls: beats/bar and downbeat clamp and do not enter undo history', () => {
  let s = run(start(), { type: 'setBeatsPerBar', value: 3 }, { type: 'setDownbeat', value: 2 });
  expect(s.file.grid).toMatchObject({ beatsPerBar: 3, downbeatBeat: 2 });
  expect(run(s, { type: 'setBeatsPerBar', value: 99 }).file.grid.beatsPerBar).toBe(12);
  expect(run(s, { type: 'setDownbeat', value: -4 }).file.grid.downbeatBeat).toBe(0);
  expect(s.past).toEqual([]);
});

test('setKey: keep chords leaves labels alone; transpose shifts them; both mark the key as user-set', () => {
  const labeled = run(start(), { type: 'digit', digit: 6 }); // A:min
  const keep = run(labeled, { type: 'setKey', tonic: 'A', mode: 'minor', transpose: false });
  expect(keep.file.key).toEqual({ tonic: 'A', mode: 'minor', source: 'user' });
  expect(keep.file.spans[0].label).toBe('A:min');
  const moved = run(labeled, { type: 'setKey', tonic: 'D', mode: 'major', transpose: true }); // C → D = +2
  expect(moved.file.spans[0].label).toBe('B:min');
  expect(moved.past).toHaveLength(2); // the transpose is undoable
});

test('no beats: editing actions are no-ops instead of crashing (Review Focus 1)', () => {
  const s = start({ beats: [] });
  expect(() => run(s, { type: 'digit', digit: 6 }, { type: 'confirm' }, { type: 'toggle', which: 'm' })).not.toThrow();
  expect(run(s, { type: 'digit', digit: 6 }).file.spans).toEqual([]);
  expect(run(s, { type: 'moveCursor', delta: 3 }).cursor).toBe(0);
});
