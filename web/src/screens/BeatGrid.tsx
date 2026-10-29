import { beatIndexAt, chordBeatSpan } from '../lib/beats';
import EditPopover from './EditPopover';

/** Beats per row (4 bars, meter-aware) - shared with Sheet.tsx's row-change scroll gating. */
export function rowLenFor(meter?: { beatsPerBar: number; confidence: number }): number {
  return (meter?.beatsPerBar ?? 4) * 4;
}

export interface DecoratedChord {
  index: number;
  start: number;
  end: number;
  quality: string;
  label: string;
  isCurrent: boolean;
  isEditing: boolean;
  edited: boolean;
  fontSize: number;
  textColor: string;
  underline: string;
}

export interface BeatGridProps {
  beats: number[];
  downbeats?: number[];
  meter?: { beatsPerBar: number; confidence: number };
  chords: DecoratedChord[];
  currentBeatIndex: number;
  onToggleEdit: (index: number) => void;
  onRootUp: (index: number) => void;
  onRootDown: (index: number) => void;
  onQuality: (index: number, quality: string) => void;
  onReset: (index: number) => void;
  onCloseEdit: () => void;
}

interface Cell {
  beatIndex: number;
  chord?: DecoratedChord;
  isBarStart: boolean;
  isNow: boolean;
  isDone: boolean;
}

function buildCells({ beats, downbeats, meter, chords, currentBeatIndex }: BeatGridProps): Cell[] {
  if (beats.length === 0) {
    // Degraded mode: no beat grid on this chart (e.g. a very short clip with no
    // detected rhythm) - one cell per chord instead of one per beat, same visual
    // language, no per-beat sweep since there's nothing to sweep through.
    const curIdx = chords.findIndex((c) => c.isCurrent);
    return chords.map((c, i) => ({
      beatIndex: i,
      chord: c,
      isBarStart: false,
      isNow: c.isCurrent,
      isDone: curIdx >= 0 && i < curIdx,
    }));
  }

  const downbeatSet = new Set(downbeats ?? []);
  const beatsPerBar = meter?.beatsPerBar ?? 4;
  const beatChord = new Array<DecoratedChord | undefined>(beats.length).fill(undefined);
  // Beat index each chord's label actually renders on. Usually its first beat,
  // but a chord that doesn't land cleanly on a beat boundary (a short passing
  // chord, a pickup before beats[0], or a chord after the last beat) has no
  // firstBeat from chordBeatSpan - fall back to its closest beat cell so it's
  // never invisible or uneditable, even without a dedicated span. If more than
  // one such chord lands on the same cell, the last one wins (acceptable
  // minimal fix, not a new crowded-cell design).
  const chordStartBeat = new Map<DecoratedChord, number>();
  chords.forEach((c) => {
    const { firstBeat, beatCount } = chordBeatSpan(beats, c);
    if (firstBeat >= 0) {
      for (let b = firstBeat; b < firstBeat + beatCount; b++) beatChord[b] = c;
      chordStartBeat.set(c, firstBeat);
      return;
    }
    const closest = Math.min(Math.max(beatIndexAt(beats, c.start), 0), beats.length - 1);
    beatChord[closest] = c;
    chordStartBeat.set(c, closest);
  });

  return beats.map((t, b) => {
    const chord = beatChord[b];
    const isChordStart = !!chord && chordStartBeat.get(chord) === b;
    return {
      beatIndex: b,
      chord: isChordStart ? chord : undefined,
      isBarStart: downbeatSet.size > 0 ? downbeatSet.has(t) : b % beatsPerBar === 0,
      isNow: b === currentBeatIndex,
      isDone: currentBeatIndex >= 0 && b < currentBeatIndex,
    };
  });
}

export default function BeatGrid(props: BeatGridProps) {
  const { meter, onToggleEdit, onRootUp, onRootDown, onQuality, onReset, onCloseEdit } = props;
  const rowLen = rowLenFor(meter);
  const cells = buildCells(props);

  const rows: Cell[][] = [];
  for (let i = 0; i < cells.length; i += rowLen) rows.push(cells.slice(i, i + rowLen));

  return (
    <div>
      {rows.map((row, ri) => (
        <div
          key={ri}
          data-row={ri}
          style={{ display: 'grid', gridTemplateColumns: `repeat(${rowLen}, minmax(0, 1fr))` }}
        >
          {row.map((cell) => (
            <div
              key={cell.beatIndex}
              data-beat-index={cell.beatIndex}
              data-testid={cell.isNow ? 'beat-now' : undefined}
              style={{
                position: 'relative',
                minHeight: 60,
                padding: 8,
                boxSizing: 'border-box',
                borderLeft: cell.isBarStart ? '2px solid oklch(0.82 0.012 90)' : '1px solid oklch(0.93 0.008 90)',
                borderBottom: '1px solid oklch(0.93 0.008 90)',
                background: cell.isNow
                  ? 'oklch(0.88 0.14 90)'
                  : cell.isDone
                    ? 'oklch(0.965 0.012 90)'
                    : 'transparent',
                borderRadius: cell.isNow ? 4 : 0,
              }}
            >
              {cell.chord && cell.chord.quality === 'N' && (
                <span
                  style={{
                    display: 'inline-block', maxWidth: '100%', overflow: 'hidden',
                    whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    fontFamily: "'Fraunces', serif", fontWeight: 600,
                    fontSize: cell.chord.fontSize, color: 'oklch(0.52 0.02 70)',
                  }}
                >
                  {cell.chord.label}
                </span>
              )}
              {cell.chord && cell.chord.quality !== 'N' && (
                <>
                  <button
                    onClick={() => onToggleEdit(cell.chord!.index)}
                    style={{
                      display: 'inline-block', maxWidth: '100%', overflow: 'hidden',
                      whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      fontFamily: "'Fraunces', serif", fontWeight: 600,
                      fontSize: cell.chord.fontSize, color: cell.chord.textColor,
                      borderBottom: cell.chord.underline, paddingBottom: 3,
                    }}
                  >
                    {cell.chord.label}
                  </button>
                  {cell.chord.edited && (
                    <span
                      data-testid="edited-dot"
                      style={{
                        position: 'absolute', top: 6, right: 6, width: 5, height: 5,
                        borderRadius: '50%', background: 'oklch(0.70 0.10 25)',
                      }}
                    />
                  )}
                  {cell.chord.isEditing && (
                    <EditPopover
                      label={cell.chord.label}
                      edited={cell.chord.edited}
                      onRootUp={() => onRootUp(cell.chord!.index)}
                      onRootDown={() => onRootDown(cell.chord!.index)}
                      onQuality={(q) => onQuality(cell.chord!.index, q)}
                      onReset={() => onReset(cell.chord!.index)}
                      onClose={onCloseEdit}
                    />
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
