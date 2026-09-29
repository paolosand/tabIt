import { chordForDigit, nameOf, pcOf, type QualityToggle } from '../lib/gold/degrees.ts';
import { barEndBeat, effectiveBeats, firstBeatAtOrAfter, meanInterval } from '../lib/gold/grid.ts';
import {
  MAX_AUTO_EXTEND_BARS, clearAt, computeGhosts, confirmGhost, placeChord, retoneAt, spanAt,
  transposeSpans, type PlaceBase,
} from '../lib/gold/spans.ts';
import type { GoldFile, GoldSpan, Mode } from '../lib/gold/types.ts';

export const UNDO_LIMIT = 200;

export interface AnnotatorState {
  file: GoldFile;
  /** index into the effective beat grid */
  cursor: number;
  /** the `b` prefix was pressed and applies to the next digit */
  flatPending: boolean;
  past: GoldSpan[][];
  future: GoldSpan[][];
}

export type Action =
  | { type: 'digit'; digit: number }
  | { type: 'flatPrefix' }
  | { type: 'toggle'; which: QualityToggle }
  | { type: 'mark'; kind: 'N' | 'X' }
  | { type: 'confirm' }
  | { type: 'clear' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'setCursor'; beat: number }
  | { type: 'moveCursor'; delta: number }
  | { type: 'moveRow'; dir: 1 | -1 }
  | { type: 'setBeatsPerBar'; value: number }
  | { type: 'setDownbeat'; value: number }
  | { type: 'setKey'; tonic: string; mode: Mode; transpose: boolean };

export function initState(file: GoldFile): AnnotatorState {
  return { file, cursor: 0, flatPending: false, past: [], future: [] };
}

const now = () => new Date().toISOString();
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function context(file: GoldFile, cursor: number) {
  const beats = effectiveBeats(file.beats, file.grid);
  const mean = meanInterval(beats);
  const ghosts = computeGhosts(file.engine.chords, file.spans, file.blind);
  const { beatsPerBar, downbeatBeat } = file.grid;
  const endBeat = barEndBeat(cursor, beatsPerBar, downbeatBeat);
  const base: PlaceBase = {
    barEnd: endBeat < beats.length ? beats[endBeat] : file.duration,
    duration: file.duration,
    tol: 0.45 * mean,
    autoExtendMax: MAX_AUTO_EXTEND_BARS * beatsPerBar * mean,
  };
  return { beats, ghosts, base, t: beats[cursor] as number | undefined };
}

/** Apply new spans, recording history only when they actually changed. */
function commit(state: AnnotatorState, spans: GoldSpan[], extra: Partial<AnnotatorState> = {}): AnnotatorState {
  if (spans === state.file.spans) return { ...state, ...extra, flatPending: false };
  return {
    ...state,
    ...extra,
    flatPending: false,
    file: { ...state.file, spans, updatedAt: now() },
    past: [...state.past, state.file.spans].slice(-UNDO_LIMIT),
    future: [],
  };
}

export function reduce(state: AnnotatorState, a: Action): AnnotatorState {
  const { file, cursor } = state;

  switch (a.type) {
    case 'flatPrefix':
      return { ...state, flatPending: true };

    case 'setCursor':
    case 'moveCursor':
    case 'moveRow': {
      const last = Math.max(0, effectiveBeats(file.beats, file.grid).length - 1);
      const target =
        a.type === 'setCursor' ? a.beat
        : a.type === 'moveCursor' ? cursor + a.delta
        : cursor + a.dir * file.grid.beatsPerBar * 4;
      return { ...state, cursor: clamp(target, 0, last), flatPending: false };
    }

    case 'setBeatsPerBar':
      return { ...state, file: { ...file, grid: { ...file.grid, beatsPerBar: clamp(Math.round(a.value), 1, 12) }, updatedAt: now() } };

    case 'setDownbeat':
      return { ...state, file: { ...file, grid: { ...file.grid, downbeatBeat: Math.max(0, Math.round(a.value)) }, updatedAt: now() } };

    case 'setKey': {
      const delta = pcOf(a.tonic) - pcOf(file.key.tonic);
      const spans = a.transpose ? transposeSpans(file.spans, delta) : file.spans;
      const next: GoldFile = {
        ...file,
        key: { tonic: nameOf(pcOf(a.tonic)), mode: a.mode, source: 'user' },
        spans,
        updatedAt: now(),
      };
      const changed = spans !== file.spans;
      return {
        ...state,
        file: next,
        flatPending: false,
        past: changed ? [...state.past, file.spans].slice(-UNDO_LIMIT) : state.past,
        future: changed ? [] : state.future,
      };
    }

    case 'undo': {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        ...state,
        file: { ...file, spans: prev, updatedAt: now() },
        past: state.past.slice(0, -1),
        future: [...state.future, file.spans],
        flatPending: false,
      };
    }

    case 'redo': {
      const next = state.future[state.future.length - 1];
      if (!next) return state;
      return {
        ...state,
        file: { ...file, spans: next, updatedAt: now() },
        past: [...state.past, file.spans].slice(-UNDO_LIMIT),
        future: state.future.slice(0, -1),
        flatPending: false,
      };
    }

    default:
      break;
  }

  // editing actions all need a cursor beat
  const c = context(file, cursor);
  if (c.t === undefined) return { ...state, flatPending: false };
  const t = c.t;

  switch (a.type) {
    case 'digit':
      return commit(state, placeChord(file.spans, c.ghosts, {
        ...c.base, t, chord: chordForDigit(file.key, a.digit, state.flatPending),
      }));

    case 'toggle':
      return commit(state, retoneAt(file.spans, c.ghosts, t, a.which, c.base));

    case 'mark':
      return commit(state, placeChord(file.spans, c.ghosts, {
        ...c.base, t,
        chord: a.kind === 'N' ? { root: 'N', quality: 'N' } : { root: null, quality: 'X' },
      }));

    case 'confirm': {
      const r = confirmGhost(file.spans, c.ghosts, t);
      if (r) {
        const next = clamp(firstBeatAtOrAfter(c.beats, r.next - c.base.tol), 0, c.beats.length - 1);
        return commit(state, r.spans, { cursor: next });
      }
      const s = spanAt(file.spans, t);
      if (s) {
        const next = clamp(firstBeatAtOrAfter(c.beats, s.end - c.base.tol), 0, c.beats.length - 1);
        return { ...state, cursor: next, flatPending: false };
      }
      return state;
    }

    case 'clear':
      return commit(state, clearAt(file.spans, t));

    default:
      return state;
  }
}
