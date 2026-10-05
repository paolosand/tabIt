import type { CSSProperties } from 'react';
import { chordName, numeralFor } from '../lib/gold/degrees.ts';
import type { SheetRow } from '../lib/gold/grid.ts';
import type { GoldKey } from '../lib/gold/types.ts';
import { clipToRow, columnFromClick, formatTime, type Seg } from './layout.ts';

const INK = 'oklch(0.28 0.02 70)';
const MUTED = 'oklch(0.55 0.02 70)';
const ACCENT = 'oklch(0.62 0.14 65)';
const LINE = 'oklch(0.85 0.01 80)';
const LINE_STRONG = 'oklch(0.7 0.02 75)';

function chipStyle(seg: Seg, colStart: number, colEnd: number): CSSProperties {
  const base: CSSProperties = {
    gridColumn: `${colStart} / ${colEnd}`, gridRow: 1, margin: '3px 2px', borderRadius: 6,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    minHeight: 36, fontWeight: 600, fontSize: 15, lineHeight: 1.15, zIndex: 1, overflow: 'hidden',
    color: INK,
  };
  if (seg.kind === 'ghost') {
    return { ...base, border: `1.5px dashed ${LINE_STRONG}`, color: MUTED, fontWeight: 500, background: 'oklch(0.97 0.006 85)' };
  }
  if (seg.flag === 'skip') {
    return {
      ...base, color: MUTED, border: `1.5px solid ${LINE_STRONG}`,
      background: 'repeating-linear-gradient(45deg, oklch(0.92 0.01 80) 0 6px, transparent 6px 12px)',
    };
  }
  return {
    ...base, background: 'oklch(0.95 0.05 75)',
    border: `1.5px ${seg.flag === 'sure' ? 'solid' : 'dashed'} ${ACCENT}`,
  };
}

export interface AnnotateSheetProps {
  rows: SheetRow[];
  beats: number[];
  segs: Seg[];
  keyInfo: GoldKey;
  cursor: number;
  playheadBeat: number;
  onSelectBeat: (beat: number) => void;
}

export default function AnnotateSheet({ rows, beats, segs, keyInfo, cursor, playheadBeat, onSelectBeat }: AnnotateSheetProps) {
  return (
    <div style={{ padding: '8px 16px 48px' }}>
      {rows.map((row) => {
        const BARS_PER_ROW = 4; // matches buildRows' default
        const firstBeat = Math.max(0, row.startBeat);
        const cursorHere = cursor >= row.startBeat && cursor < row.startBeat + row.cols;
        const playHere = playheadBeat >= row.startBeat && playheadBeat < row.startBeat + row.cols;
        return (
          <div key={row.startBeat} data-testid="sheet-row" style={{ display: 'flex', alignItems: 'stretch', marginBottom: 6 }}>
            <div style={{ width: 58, flex: 'none', fontSize: 11, color: MUTED, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <b>{formatTime(beats[firstBeat] ?? 0)}</b>
              <span>bar {row.startBar + 1}</span>
            </div>
            <div
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                onSelectBeat(row.startBeat + columnFromClick(e.clientX, r.left, r.width, row.cols));
              }}
              style={{
                position: 'relative', flex: 1, display: 'grid', gridTemplateColumns: `repeat(${row.cols}, 1fr)`,
                minHeight: 46, cursor: 'pointer', borderRight: `2px solid ${LINE_STRONG}`,
                backgroundImage:
                  `linear-gradient(to right, ${LINE_STRONG} 2px, transparent 2px), linear-gradient(to right, ${LINE} 1px, transparent 1px)`,
                backgroundSize: `calc(100% / ${BARS_PER_ROW}) 100%, calc(100% / ${row.cols}) 100%`,
              }}
            >
              {playHere && (
                <div style={{ gridColumn: playheadBeat - row.startBeat + 1, gridRow: 1, background: 'oklch(0.85 0.12 75 / 0.35)', zIndex: 0 }} />
              )}
              {segs.map((seg) => {
                const clip = clipToRow(seg, row);
                if (!clip) return null;
                return (
                  <div
                    key={seg.key}
                    data-testid="chip"
                    data-kind={seg.kind}
                    data-label={seg.chord.quality === 'N' ? 'N' : seg.chord.quality === 'X' ? 'X' : `${seg.chord.root}:${seg.chord.quality}`}
                    style={chipStyle(seg, clip.colStart, clip.colEnd)}
                  >
                    <span>{numeralFor(keyInfo, seg.chord)}</span>
                    <small style={{ fontWeight: 400, color: MUTED, fontSize: 11 }}>{chordName(seg.chord)}</small>
                  </div>
                );
              })}
              {cursorHere && (
                <div
                  id="cursor-marker"
                  data-testid="cursor"
                  style={{
                    gridColumn: cursor - row.startBeat + 1, gridRow: 1, zIndex: 2, pointerEvents: 'none',
                    outline: `2px solid ${ACCENT}`, outlineOffset: -1, borderRadius: 4,
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
