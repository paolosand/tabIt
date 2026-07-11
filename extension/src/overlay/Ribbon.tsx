import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { chordBeatSpan, beatWithinChord } from '../../../web/src/lib/beats';

export interface RibbonChord {
  start: number; end: number; label: string; quality: string; low: boolean;
}
export interface RibbonProps {
  beats: number[];
  chords: RibbonChord[];
  currentBeat: number;
  currentChordIndex: number;
  downbeats?: number[];
}

const CELL = 44;         // px, must match .tabit-beat width in styles.ts
const LEAD_CELLS = 8;    // keep "now" ~1/3 from the left edge
const WINDOW = 30;       // minimum cells rendered either side of now

/**
 * Clamp the track slide so it never scrolls past the last beat cell.
 * When viewWidth is 0 (container unmeasured, e.g. jsdom), the upper bound
 * degrades to trackWidth so behavior matches the unclamped original.
 */
export function clampTx(offset: number, trackWidth: number, viewWidth: number): number {
  return Math.max(0, Math.min(offset, Math.max(0, trackWidth - viewWidth)));
}

/** Windowed beat-grid strip: a renderer with internal viewport-width measurement
 *  (so the window can widen past WINDOW on wide viewports); time-derived indices
 *  (currentBeat, currentChordIndex) still come from Panel. */
export default function Ribbon({ beats, chords, currentBeat, currentChordIndex, downbeats }: RibbonProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [viewWidth, setViewWidth] = useState(0);
  const downbeatSet = useMemo(() => new Set(downbeats ?? []), [downbeats]);

  useLayoutEffect(() => {
    const measure = () => setViewWidth(wrapRef.current?.clientWidth ?? 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // beat index -> chord index (memoized; -1 where no chord covers the beat)
  const beatChord = useMemo(() => {
    const map = new Array<number>(beats.length).fill(-1);
    chords.forEach((c, ci) => {
      const { firstBeat, beatCount } = chordBeatSpan(beats, c);
      for (let b = firstBeat; b >= 0 && b < firstBeat + beatCount; b++) map[b] = ci;
    });
    return map;
  }, [beats, chords]);

  // Widen the window past WINDOW when the measured viewport is wider than it covers
  // (wide monitors), so the track always fills the visible width instead of leaving
  // blank void at the edges. jsdom reports viewWidth 0 (unmeasured), which degrades
  // windowCells back to WINDOW, leaving existing tests' behavior unchanged.
  const windowCells = Math.max(WINDOW, viewWidth ? Math.ceil(viewWidth / CELL) + 2 : 0);
  const anchor = Math.max(0, currentBeat);
  const from = Math.max(0, anchor - windowCells);
  const to = Math.min(beats.length, anchor + windowCells);
  const current = chords[currentChordIndex];
  const curSpan = current ? chordBeatSpan(beats, current) : { firstBeat: -1, beatCount: 0 };
  const curWithin = current ? beatWithinChord(beats, current, beats[currentBeat] ?? -Infinity) : 0;
  const offset = currentBeat <= 0 ? 0 : (currentBeat - LEAD_CELLS) * CELL;
  const tx = clampTx(offset, beats.length * CELL, viewWidth);

  const cells = [];
  for (let b = from; b < to; b++) {
    const ci = beatChord[b];
    const chord = ci >= 0 ? chords[ci] : undefined;
    const isFirstOfChord = chord ? chordBeatSpan(beats, chord).firstBeat === b : false;
    const showLabel = !!chord && isFirstOfChord && chord.quality !== 'N';
    const cls = [
      'tabit-beat',
      (downbeatSet.size > 0 ? downbeatSet.has(beats[b]) : b % 4 === 0) ? 'tabit-beat-bar' : '',
      b === currentBeat ? 'tabit-beat-now' : '',
      ci === currentChordIndex && b < currentBeat ? 'tabit-beat-done' : '',
    ].filter(Boolean).join(' ');
    cells.push(
      <div key={b} className={cls} style={{ left: b * CELL }}>
        {showLabel && (
          <span className={`tabit-beat-chord${chord!.low ? ' tabit-beat-chord-muted' : ''}`}>
            {chord!.label}
          </span>
        )}
        {ci === currentChordIndex && isFirstOfChord && curSpan.beatCount > 0 && (
          <span className="tabit-beat-pips">
            {Array.from({ length: curSpan.beatCount }, (_, p) => (
              <span key={p} className={`tabit-beat-pip${p < curWithin ? ' tabit-beat-pip-hit' : ''}`} />
            ))}
          </span>
        )}
      </div>,
    );
  }

  return (
    <div className="tabit-ribbon" data-testid="ribbon" ref={wrapRef}>
      <div
        className="tabit-ribbon-track"
        style={{ width: beats.length * CELL, transform: `translateX(${-tx}px)` }}
        /* `${-tx}` renders "0" when tx is 0 (JS stringifies -0 as "0"), matching the
           parked-at-start test; nonzero tx renders "-176" etc. */
      >
        {cells}
      </div>
      <div className="tabit-ribbon-fade" />
    </div>
  );
}
