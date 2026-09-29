import type { ChordChoice, EngineChord, Flag, GoldSpan, Provenance } from './types.ts';
import { harteLabel, nameOf, pcOf, reduceEngineChord, toggleQuality, type QualityToggle } from './degrees.ts';

const EPS = 1e-6;

/** A preceding span may auto-extend across a gap of at most this many bars. */
export const MAX_AUTO_EXTEND_BARS = 4;

/** An unreviewed engine chord (or the unreviewed remainder of one). Never persisted. */
export interface Ghost {
  start: number;
  end: number;
  chord: ChordChoice;
}

export interface PlaceOpts {
  /** time of the cursor beat, seconds */
  t: number;
  chord: ChordChoice;
  /** time at which the bar containing t ends (default end for a chord in an empty region) */
  barEnd: number;
  duration: number;
  /** a cursor within `tol` of a chip's start counts as being ON its first beat */
  tol: number;
  /** longest gap (seconds) a preceding span may auto-extend across */
  autoExtendMax: number;
  flag?: Flag;
}
export type PlaceBase = Omit<PlaceOpts, 't' | 'chord'>;

const sameChord = (a: ChordChoice, b: ChordChoice) => a.root === b.root && a.quality === b.quality;
const chordOf = (s: GoldSpan): ChordChoice => ({ root: s.root, quality: s.quality });
const byStart = (a: { start: number }, b: { start: number }) => a.start - b.start;

function makeSpan(start: number, end: number, chord: ChordChoice, flag: Flag, source: Provenance): GoldSpan {
  return { start, end, root: chord.root, quality: chord.quality, label: harteLabel(chord), flag, source };
}

/** Engine chords minus everything already covered by a span. Blind mode hides them all. */
export function computeGhosts(engine: EngineChord[], spans: GoldSpan[], blind: boolean): Ghost[] {
  if (blind) return [];
  const out: Ghost[] = [];
  for (const e of engine) {
    let pieces: Array<[number, number]> = [[e.start, e.end]];
    for (const s of spans) {
      if (s.end <= e.start + EPS || s.start >= e.end - EPS) continue;
      const next: Array<[number, number]> = [];
      for (const [a, b] of pieces) {
        if (s.end <= a + EPS || s.start >= b - EPS) {
          next.push([a, b]);
          continue;
        }
        if (s.start > a + EPS) next.push([a, s.start]);
        if (s.end < b - EPS) next.push([s.end, b]);
      }
      pieces = next;
    }
    const chord = reduceEngineChord(e.root, e.quality);
    for (const [a, b] of pieces) if (b - a > EPS) out.push({ start: a, end: b, chord });
  }
  return out.sort(byStart);
}

export function spanAt(spans: GoldSpan[], t: number): GoldSpan | undefined {
  return spans.find((s) => s.start <= t + EPS && t < s.end - EPS);
}

export function ghostAt(ghosts: Ghost[], t: number): Ghost | undefined {
  return ghosts.find((g) => g.start <= t + EPS && t < g.end - EPS);
}

function placeInEmpty(spans: GoldSpan[], ghosts: Ghost[], o: PlaceOpts, flag: Flag): GoldSpan[] {
  const nextSpan = spans.find((s) => s.start > o.t);
  const nextGhost = ghosts.find((g) => g.start > o.t);
  const end = Math.min(o.barEnd, o.duration, nextSpan?.start ?? Infinity, nextGhost?.start ?? Infinity);
  if (end - o.t <= EPS) return spans;
  const prev = [...spans].reverse().find((s) => s.end <= o.t + EPS);
  let out = spans;
  if (
    prev && o.t - prev.end > EPS && o.t - prev.end <= o.autoExtendMax &&
    !ghosts.some((g) => g.end > prev.end + EPS && g.start < o.t - EPS)
  ) {
    const extended: GoldSpan = { ...prev, end: o.t, source: prev.source === 'confirmed' ? 'edited' : prev.source };
    out = out.map((s) => (s === prev ? extended : s));
  }
  return [...out, makeSpan(o.t, end, o.chord, flag, 'manual')].sort(byStart);
}

/** Place `chord` at time t following the spec's extension rule. Returns the same array if nothing changed. */
export function placeChord(spans: GoldSpan[], ghosts: Ghost[], o: PlaceOpts): GoldSpan[] {
  const flag: Flag = o.chord.quality === 'X' ? 'skip' : (o.flag ?? 'guess');
  if (o.t >= o.duration - EPS || o.t < -EPS) return spans;

  const span = spanAt(spans, o.t);
  if (span) {
    if (o.t - span.start < o.tol) {
      const changed = !sameChord(chordOf(span), o.chord);
      const source: Provenance = span.source === 'confirmed' && changed ? 'edited' : span.source;
      const replaced = makeSpan(span.start, span.end, o.chord, flag, source);
      return spans.map((s) => (s === span ? replaced : s));
    }
    const head: GoldSpan = { ...span, end: o.t, source: span.source === 'confirmed' ? 'edited' : span.source };
    const tail = makeSpan(o.t, span.end, o.chord, flag, span.source === 'manual' ? 'manual' : 'edited');
    return spans.flatMap((s) => (s === span ? [head, tail] : [s]));
  }

  const ghost = ghostAt(ghosts, o.t);
  if (ghost) {
    const atStart = o.t - ghost.start < o.tol;
    const start = atStart ? ghost.start : o.t;
    const source: Provenance = atStart && sameChord(ghost.chord, o.chord) ? 'confirmed' : 'edited';
    return [...spans, makeSpan(start, ghost.end, o.chord, flag, source)].sort(byStart);
  }

  return placeInEmpty(spans, ghosts, o, flag);
}

/** Enter: accept the ghost under t as a confirmed guess. `next` is where the cursor should go. */
export function confirmGhost(
  spans: GoldSpan[], ghosts: Ghost[], t: number,
): { spans: GoldSpan[]; next: number } | null {
  const g = ghostAt(ghosts, t);
  if (!g) return null;
  return {
    spans: [...spans, makeSpan(g.start, g.end, g.chord, 'guess', 'confirmed')].sort(byStart),
    next: g.end,
  };
}

/** Backspace: remove the span under t. (Its engine ghost, if any, reappears as unreviewed.) */
export function clearAt(spans: GoldSpan[], t: number): GoldSpan[] {
  const s = spanAt(spans, t);
  return s ? spans.filter((x) => x !== s) : spans;
}

/** m / d / j: toggle the quality of the chord under t (a span or a ghost) over its full extent. */
export function retoneAt(
  spans: GoldSpan[], ghosts: Ghost[], t: number, which: QualityToggle, base: PlaceBase,
): GoldSpan[] {
  const span = spanAt(spans, t);
  const ghost = span ? undefined : ghostAt(ghosts, t);
  const current = span ? chordOf(span) : ghost?.chord;
  const start = span ? span.start : ghost?.start;
  if (!current || start === undefined) return spans;
  const next = toggleQuality(current, which);
  if (sameChord(next, current)) return spans;
  return placeChord(spans, ghosts, { ...base, t: start, chord: next });
}

/** Shift every chord's root (X and N untouched) and relabel. */
export function transposeSpans(spans: GoldSpan[], semitones: number): GoldSpan[] {
  if (semitones % 12 === 0) return spans;
  return spans.map((s) => {
    if (s.root === null || s.root === 'N') return s;
    const chord: ChordChoice = { root: nameOf(pcOf(s.root) + semitones), quality: s.quality };
    return { ...s, root: chord.root, label: harteLabel(chord) };
  });
}
