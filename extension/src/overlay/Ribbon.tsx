import { useMemo } from 'react';
import { chordBeatSpan, beatWithinChord } from '../../../web/src/lib/beats';

export interface RibbonChord {
  start: number; end: number; label: string; quality: string; low: boolean;
}
export interface RibbonProps {
  beats: number[];
  chords: RibbonChord[];
  currentBeat: number;
  currentChordIndex: number;
}

const CELL = 44;         // px, must match .tabit-beat min-width in styles.ts
const LEAD_CELLS = 8;    // keep "now" ~1/3 from the left edge
const WINDOW = 30;       // cells rendered either side of now

/** Windowed beat-grid strip. Pure renderer: Panel computes time-derived indices. */
export default function Ribbon({ beats, chords, currentBeat, currentChordIndex }: RibbonProps) {
  // beat index -> chord index (memoized; -1 where no chord covers the beat)
  const beatChord = useMemo(() => {
    const map = new Array<number>(beats.length).fill(-1);
    chords.forEach((c, ci) => {
      const { firstBeat, beatCount } = chordBeatSpan(beats, c);
      for (let b = firstBeat; b >= 0 && b < firstBeat + beatCount; b++) map[b] = ci;
    });
    return map;
  }, [beats, chords]);

  const anchor = Math.max(0, currentBeat);
  const from = Math.max(0, anchor - WINDOW);
  const to = Math.min(beats.length, anchor + WINDOW);
  const current = chords[currentChordIndex];
  const curSpan = current ? chordBeatSpan(beats, current) : { firstBeat: -1, beatCount: 0 };
  const curWithin = current ? beatWithinChord(beats, current, beats[currentBeat] ?? -Infinity) : 0;
  const offset = currentBeat <= 0 ? 0 : (currentBeat - LEAD_CELLS) * CELL;
  const tx = Math.max(0, offset);

  const cells = [];
  for (let b = from; b < to; b++) {
    const ci = beatChord[b];
    const chord = ci >= 0 ? chords[ci] : undefined;
    const isFirstOfChord = chord ? chordBeatSpan(beats, chord).firstBeat === b : false;
    const showLabel = !!chord && isFirstOfChord && chord.quality !== 'N';
    const cls = [
      'tabit-beat',
      b % 4 === 0 ? 'tabit-beat-bar' : '',
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
    <div className="tabit-ribbon" data-testid="ribbon">
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
