import { beatIndexAt } from '../beats.ts';
import type { GoldGrid } from './types.ts';

export const LOOSE_CV = 0.08;

/** Engine beats → the grid the user labels on: ½× keeps every other beat, 2× adds midpoints, then nudge. */
export function effectiveBeats(beats: number[], grid: Pick<GoldGrid, 'factor' | 'nudgeSec'>): number[] {
  let out: number[];
  if (grid.factor === 0.5) {
    out = beats.filter((_, i) => i % 2 === 0);
  } else if (grid.factor === 2) {
    out = [];
    beats.forEach((b, i) => {
      out.push(b);
      if (i + 1 < beats.length) out.push((b + beats[i + 1]) / 2);
    });
  } else {
    out = beats.slice();
  }
  return grid.nudgeSec === 0 ? out : out.map((b) => b + grid.nudgeSec);
}

export interface GridQuality {
  bpm: number;
  /** coefficient of variation of the beat spacing */
  cv: number;
  loose: boolean;
}

export function gridQuality(beats: number[]): GridQuality {
  if (beats.length < 3) return { bpm: 0, cv: 0, loose: false };
  const ivs: number[] = [];
  for (let i = 0; i + 1 < beats.length; i++) ivs.push(beats[i + 1] - beats[i]);
  const mean = ivs.reduce((a, b) => a + b, 0) / ivs.length;
  const sd = Math.sqrt(ivs.reduce((a, b) => a + (b - mean) ** 2, 0) / ivs.length);
  const cv = sd / mean;
  return { bpm: 60 / mean, cv, loose: cv > LOOSE_CV };
}

export function meanInterval(beats: number[]): number {
  if (beats.length < 2) return 0.5;
  return (beats[beats.length - 1] - beats[0]) / (beats.length - 1);
}

/** Index of the first beat with time >= t (beats.length if none). */
export function firstBeatAtOrAfter(beats: number[], t: number): number {
  const i = beatIndexAt(beats, t);
  return i >= 0 && beats[i] === t ? i : i + 1;
}

/** Index of the beat nearest to t (-1 if there are no beats). */
export function nearestBeat(beats: number[], t: number): number {
  if (beats.length === 0) return -1;
  const i = beatIndexAt(beats, t);
  if (i < 0) return 0;
  if (i >= beats.length - 1) return beats.length - 1;
  return t - beats[i] <= beats[i + 1] - t ? i : i + 1;
}

/** Beat index where the bar containing `beat` ends (exclusive). Bar 0 starts at `downbeatBeat`. */
export function barEndBeat(beat: number, beatsPerBar: number, downbeatBeat: number): number {
  return downbeatBeat + (Math.floor((beat - downbeatBeat) / beatsPerBar) + 1) * beatsPerBar;
}

export interface SheetRow {
  /** bar index of the row's first bar (0 = the bar starting at the downbeat; -1 = pickup) */
  startBar: number;
  /** beat index of the row's first column (negative → pickup padding before beat 0) */
  startBeat: number;
  cols: number;
}

export function buildRows(
  beatCount: number, beatsPerBar: number, downbeatBeat: number, barsPerRow = 4,
): SheetRow[] {
  const firstBar = 0 - Math.ceil(downbeatBeat / beatsPerBar); // "0 -" avoids a -0
  const lastBar = Math.floor((beatCount - 1 - downbeatBeat) / beatsPerBar);
  const rows: SheetRow[] = [];
  for (let bar = firstBar; bar <= lastBar; bar += barsPerRow) {
    rows.push({ startBar: bar, startBeat: downbeatBeat + bar * beatsPerBar, cols: barsPerRow * beatsPerBar });
  }
  return rows;
}
