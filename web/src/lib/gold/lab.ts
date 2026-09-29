import type { GoldFile, GoldSpan } from './types.ts';

/** 'labeled' = sure + guess spans; 'sure' = sure spans only. Everything else is X. */
export type LabTier = 'labeled' | 'sure';

const fmt = (n: number) => n.toFixed(3);

/** GoldFile → Harte `.lab` text covering 0 → duration contiguously (gaps and skips as X). */
export function toLab(file: Pick<GoldFile, 'spans' | 'duration'>, tier: LabTier): string {
  const rows: Array<[number, number, string]> = [];
  const push = (start: number, end: number, label: string) => {
    if (end - start <= 1e-9) return;
    const last = rows[rows.length - 1];
    if (label === 'X' && last && last[2] === 'X' && Math.abs(last[1] - start) < 1e-9) {
      last[1] = end;
      return;
    }
    rows.push([start, end, label]);
  };
  let cursor = 0;
  for (const s of file.spans) {
    if (s.start > cursor) push(cursor, s.start, 'X');
    const labeled = s.flag !== 'skip' && (tier === 'labeled' || s.flag === 'sure');
    push(s.start, s.end, labeled ? s.label : 'X');
    cursor = s.end;
  }
  if (cursor < file.duration) push(cursor, file.duration, 'X');
  if (rows.length === 0) rows.push([0, file.duration, 'X']);
  return rows.map(([a, b, l]) => `${fmt(a)} ${fmt(b)} ${l}`).join('\n') + '\n';
}

/** Seconds covered by non-skip spans. */
export function labeledSeconds(spans: GoldSpan[]): number {
  return spans.filter((s) => s.flag !== 'skip').reduce((sum, s) => sum + (s.end - s.start), 0);
}
