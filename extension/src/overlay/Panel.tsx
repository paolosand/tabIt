import { useEffect, useRef, useState } from 'react';
import type { Chart } from '../../../web/src/lib/types';
import { findCurrentIndex, formatLabel, transposeRoot, transposeScaleName } from '../../../web/src/lib/music';
import { beatIndexAt, beatWithinChord, beatsUntil, chordBeatSpan } from '../../../web/src/lib/beats';
import { useVideoTime } from './useVideoTime';
import Ribbon from './Ribbon';

export interface PanelProps {
  chart: Chart;
  onCollapse: () => void;
}

/** Port of web/src/screens/Sheet.tsx for the extension's shadow-root overlay. Same
 *  layout, style values and decoration logic (rows of 4, ruled lines, amber marker,
 *  next-chord underline, low-confidence dimming, auto-scroll, Now/Next footer) with
 *  seven deltas from the web version:
 *   1. No player column / mediaFile - time comes from the page's own <video> via
 *      useVideoTime(true), not an owned YouTubePlayer/AudioPlayer instance.
 *   2. No editing - chords are plain, non-interactive spans (no EditPopover/overrides),
 *      but the current-chord highlight keeps its data-testid="marker" for tests.
 *   3. Header is a single compact row: wordmark + inline key/tempo/scales chips +
 *      transpose +/- + a collapse control ("▴"). No "‹ new song" link, no video
 *      title (the host page shows it), no separate chips/transpose section.
 *   4. When useVideoTime reports adShowing, the sheet card dims (opacity 0.5) and a
 *      small "ad playing…" tag appears; sync resumes automatically once the ad ends.
 *   5. Everything else is identical, including the 30/26px chord sizes, <0.75
 *      confidence dotted dimming, and the empty-chords guard on the footer.
 *   6. All styling lives in styles.ts classes (shadow DOM has no page CSS, and
 *      hover/current/next/dim states need real CSS, not inline style objects).
 *   7. (spec 2026-07-10) The default view is the beat ribbon (Ribbon component,
 *      data-testid="ribbon") when the chart has a beat grid; a toggle button
 *      ("Show full sheet" / "Show beat ribbon") swaps to the full sheet and back.
 *      Charts with no beats (`chart.beats.length === 0`) force the sheet view and
 *      hide the toggle. The footer's "Next: … in N beats" / "beat N / M" counters
 *      also require beats and otherwise fall back to seconds.
 */
export default function Panel({ chart, onCollapse }: PanelProps) {
  const [transpose, setTranspose] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const { time, adShowing } = useVideoTime(true);
  const chords = chart.chords;
  const currentIndex = findCurrentIndex(chords, time);

  const decorated = chords.map((c, i) => {
    const isCurrent = i === currentIndex;
    const isNext = i === currentIndex + 1;
    const low = c.confidence < 0.75 && c.quality !== 'N';
    return {
      ...c,
      index: i,
      label: formatLabel(c.root, c.quality, c.bass, transpose),
      isCurrent,
      isNext,
      low,
    };
  });

  const rows: { chords: typeof decorated; rowIndex: number }[] = [];
  for (let i = 0; i < decorated.length; i += 4) {
    rows.push({ chords: decorated.slice(i, i + 4), rowIndex: i / 4 });
  }

  const hasBeats = chart.beats.length > 0;
  const [view, setView] = useState<'ribbon' | 'sheet'>(hasBeats ? 'ribbon' : 'sheet');

  // Deps include `view`: the ribbon is the default view, so toggling to the sheet
  // mounts its scroll container/rows for the first time without currentIndex having
  // changed. Without `view` here, that toggle would leave the sheet scrolled to the
  // top instead of the current row.
  useEffect(() => {
    const curRowIndex = Math.floor(currentIndex / 4);
    const rowEl = rowRefs.current[curRowIndex];
    const container = scrollRef.current;
    if (rowEl && container) {
      const target = rowEl.offsetTop - container.clientHeight / 2 + rowEl.clientHeight / 2;
      if (Math.abs(container.scrollTop - target) > 8) {
        container.scrollTop = target;
      }
    }
  }, [currentIndex, view]);

  const hasChords = chords.length > 0;
  const nextIdx = hasChords ? Math.min(currentIndex + 1, decorated.length - 1) : 0;
  const nextIn = hasChords ? Math.max(0, chords[nextIdx].start - time) : 0;
  const currentLabel = hasChords ? decorated[currentIndex].label : '—';
  const nextLabel = hasChords ? decorated[nextIdx].label : '—';
  const transposeLabel = transpose === 0 ? 'no shift' : transpose > 0 ? `+${transpose} st` : `${transpose} st`;
  const keyLabel = `${transposeRoot(chart.key.tonic, transpose)} ${chart.key.mode}`;
  const bpmLabel = `${Math.round(chart.tempo.bpm)} bpm`;
  const scalesLabel = chart.scales.map((s) => transposeScaleName(s.name, transpose)).join(' · ');

  const currentBeat = hasBeats ? beatIndexAt(chart.beats, time) : -1;
  const nextStart = hasChords ? chords[nextIdx].start : 0;
  const nextInBeats = hasBeats && hasChords ? beatsUntil(chart.beats, time, nextStart) : 0;
  const beatN = hasBeats && hasChords ? beatWithinChord(chart.beats, chords[currentIndex], time) : 0;
  const beatM = hasBeats && hasChords ? chordBeatSpan(chart.beats, chords[currentIndex]).beatCount : 0;
  const isLast = hasChords && currentIndex === chords.length - 1;

  return (
    <div data-screen-label="Chord sheet" className="tabit-panel">
      {/* One paper card wraps header + view + footer + toggle (see .tabit-panel-card):
          on dark-theme hosts the ink-colored header/footer text needs paper behind it,
          not the page background. */}
      <div className="tabit-panel-card">
        <div className="tabit-panel-header tabit-panel-header-compact">
          <span className="tabit-panel-wordmark">tabIt</span>
          <span className="tabit-inline-chip">Key <b>{keyLabel}</b></span>
          <span className="tabit-inline-chip">{bpmLabel}</span>
          <span className="tabit-inline-chip tabit-inline-chip-scales">Solo: <b>{scalesLabel}</b></span>
          <div className="tabit-panel-header-right">
            {adShowing && (
              <span className="tabit-ad-tag" data-testid="ad-tag">
                ad playing…
              </span>
            )}
            <button
              type="button"
              className="tabit-round-btn"
              onClick={() => setTranspose((t) => Math.max(-6, t - 1))}
              aria-label="Transpose down"
            >
              –
            </button>
            <span className="tabit-transpose-label">{transposeLabel}</span>
            <button
              type="button"
              className="tabit-round-btn"
              onClick={() => setTranspose((t) => Math.min(6, t + 1))}
              aria-label="Transpose up"
            >
              +
            </button>
            <button type="button" className="tabit-round-btn" aria-label="Collapse" onClick={onCollapse}>
              ▴
            </button>
          </div>
        </div>

        {view === 'ribbon' ? (
          <div className={`tabit-ribbon-card${adShowing ? ' tabit-sheet-dim' : ''}`}>
            <Ribbon
              beats={chart.beats}
              chords={decorated.map((d) => ({ start: d.start, end: d.end, label: d.label, quality: d.quality, low: d.low }))}
              currentBeat={currentBeat}
              currentChordIndex={currentIndex}
            />
          </div>
        ) : (
          <div className={`tabit-sheet${adShowing ? ' tabit-sheet-dim' : ''}`}>
            <div className="tabit-sheet-margin" />
            <div ref={scrollRef} className="tabit-sheet-scroll">
              {rows.map((row) => (
                <div
                  key={row.rowIndex}
                  ref={(el) => {
                    rowRefs.current[row.rowIndex] = el;
                  }}
                  className="tabit-row"
                >
                  {row.chords.map((chord, ci) => {
                    const isN = chord.quality === 'N';
                    const sizeClass = chord.isCurrent ? 'tabit-chord-label-current' : 'tabit-chord-label-normal';
                    // Mirrors web/src/screens/Sheet.tsx: `low` sets both muted text color and a
                    // dotted underline; `isNext` then overwrites ONLY the underline, so a
                    // low-confidence next chord stays muted with a solid next-underline. N
                    // chords render via a separate branch there with no decoration at all.
                    const textClass = !isN && chord.low ? 'tabit-chord-text-muted' : '';
                    const underlineClass = isN
                      ? ''
                      : chord.isNext
                        ? 'tabit-chord-underline-next'
                        : chord.low
                          ? 'tabit-chord-underline-dim'
                          : '';
                    const labelClass = [
                      'tabit-chord-label',
                      sizeClass,
                      isN ? 'tabit-chord-label-n' : '',
                      textClass,
                      underlineClass,
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <div key={ci} className="tabit-chord-cell">
                        {chord.isCurrent && <div data-testid="marker" className="tabit-chord-marker" />}
                        <span className={labelClass}>{chord.label}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasChords && (
          <div className="tabit-footer">
            <span>
              Now: <strong className="tabit-footer-strong">{currentLabel}</strong>
            </span>
            <span className="tabit-footer-dot">·</span>
            <span>
              {isLast ? (
                <>Next: — (to the end)</>
              ) : hasBeats ? (
                <>
                  {/* <=1 beat away reads "next beat" — never "in 0 beats" / "in 1 beats" */}
                  Next: <strong className="tabit-footer-next-strong">{nextLabel}</strong>{' '}
                  {nextInBeats <= 1 ? 'next beat' : `in ${nextInBeats} beats`}
                </>
              ) : (
                <>
                  Next: <strong className="tabit-footer-next-strong">{nextLabel}</strong> in {nextIn.toFixed(1)}s
                </>
              )}
            </span>
            {hasBeats && beatM > 0 && beatN > 0 && (
              <span className="tabit-footer-beatcount">
                beat {beatN} / {beatM}
              </span>
            )}
          </div>
        )}

        {hasBeats && (
          <button
            type="button"
            className="tabit-view-toggle"
            aria-label={view === 'ribbon' ? 'Show full sheet' : 'Show beat ribbon'}
            onClick={() => setView((v) => (v === 'ribbon' ? 'sheet' : 'ribbon'))}
          >
            {view === 'ribbon' ? '⌄ full sheet' : '⌃ beat ribbon'}
          </button>
        )}
      </div>
    </div>
  );
}
