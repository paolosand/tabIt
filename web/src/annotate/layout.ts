import type { ChordChoice, Flag, GoldFile, Provenance } from '../lib/gold/types.ts';
import { firstBeatAtOrAfter, type SheetRow } from '../lib/gold/grid.ts';
import type { Ghost } from '../lib/gold/spans.ts';

/** One chip on the sheet: an unreviewed engine chord (ghost) or a labeled span. */
export interface Seg {
  key: string;
  kind: 'ghost' | 'span';
  startBeat: number;
  /** exclusive */
  endBeat: number;
  chord: ChordChoice;
  flag?: Flag;
  source?: Provenance;
}

export function buildSegments(file: GoldFile, beats: number[], ghosts: Ghost[], tol: number): Seg[] {
  const range = (start: number, end: number) => {
    const s = firstBeatAtOrAfter(beats, start - tol);
    return { s, e: Math.max(firstBeatAtOrAfter(beats, end - tol), s + 1) }; // always at least one beat wide
  };
  const segs: Seg[] = [];
  for (const g of ghosts) {
    const { s, e } = range(g.start, g.end);
    segs.push({ key: `g${g.start}`, kind: 'ghost', startBeat: s, endBeat: e, chord: g.chord });
  }
  for (const sp of file.spans) {
    const { s, e } = range(sp.start, sp.end);
    segs.push({
      key: `s${sp.start}`, kind: 'span', startBeat: s, endBeat: e,
      chord: { root: sp.root, quality: sp.quality }, flag: sp.flag, source: sp.source,
    });
  }
  return segs;
}

/** 1-based CSS grid columns a segment occupies within a row, or null if it misses the row. */
export function clipToRow(seg: Seg, row: SheetRow): { colStart: number; colEnd: number } | null {
  const a = Math.max(seg.startBeat, row.startBeat);
  const b = Math.min(seg.endBeat, row.startBeat + row.cols);
  return b > a ? { colStart: a - row.startBeat + 1, colEnd: b - row.startBeat + 1 } : null;
}

export function columnFromClick(x: number, left: number, width: number, cols: number): number {
  if (width <= 0) return 0;
  return Math.min(cols - 1, Math.max(0, Math.floor(((x - left) / width) * cols)));
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
