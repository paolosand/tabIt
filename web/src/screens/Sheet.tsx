import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Chart, ChordSegment } from '../lib/types';
import { findCurrentIndex, formatLabel, transposeRoot, transposeScaleName } from '../lib/music';
import { beatIndexAt } from '../lib/beats';
import { chartKey, loadOverrides, saveOverrides, type Overrides } from '../lib/overrides';
import YouTubePlayer from '../playback/YouTubePlayer';
import AudioPlayer from '../playback/AudioPlayer';
import { usePlaybackTime, type PlaybackSource } from '../playback/usePlaybackTime';
import BeatGrid from './BeatGrid';

interface SheetProps {
  chart: Chart;
  mediaFile: File | null;
  onBack: () => void;
}

export default function Sheet({ chart, mediaFile, onBack }: SheetProps) {
  const [transpose, setTranspose] = useState(0);
  const [source, setSource] = useState<PlaybackSource | null>(null);
  const [overrides, setOverrides] = useState<Overrides>(() => loadOverrides(chartKey(chart)));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const time = usePlaybackTime(source);
  const chords = chart.chords;
  const currentIndex = findCurrentIndex(chords, time);
  const currentBeatIndex = beatIndexAt(chart.beats, time);

  // Override spread over the detected base chord; an edited chord's confidence
  // is treated as 1 so it's never shown dimmed/low-confidence (design parity).
  function effectiveChord(i: number): ChordSegment {
    const base = chords[i];
    const ov = overrides[i];
    if (!ov) return base;
    return { ...base, ...ov, confidence: 1 };
  }

  function persistOverrides(next: Overrides) {
    setOverrides(next);
    saveOverrides(chartKey(chart), next);
  }

  function toggleEdit(i: number) {
    setEditingIndex((cur) => (cur === i ? null : i));
  }

  function closeEditing() {
    setEditingIndex(null);
  }

  function nudgeRoot(i: number, delta: number) {
    const eff = effectiveChord(i);
    const newRoot = transposeRoot(eff.root, delta);
    const newBass = eff.bass === eff.root ? newRoot : eff.bass;
    persistOverrides({ ...overrides, [i]: { root: newRoot, quality: eff.quality, bass: newBass } });
  }

  function applyQuality(i: number, quality: string) {
    const eff = effectiveChord(i);
    persistOverrides({ ...overrides, [i]: { root: eff.root, quality, bass: eff.bass } });
    setEditingIndex(null);
  }

  function clearOverride(i: number) {
    const next = { ...overrides };
    delete next[i];
    persistOverrides(next);
    setEditingIndex(null);
  }

  const decorated = chords.map((_, i) => {
    const c = effectiveChord(i);
    const isCurrent = i === currentIndex;
    const isNext = i === currentIndex + 1;
    const edited = !!overrides[i];
    const low = c.confidence < 0.75 && c.quality !== 'N';
    let underline = '1.5px solid transparent';
    let textColor = 'oklch(0.28 0.02 70)';
    if (low) {
      underline = '1.5px dotted oklch(0.52 0.02 70)';
      textColor = 'oklch(0.52 0.02 70)';
    }
    if (isNext) {
      underline = '2px solid oklch(0.55 0.02 70)';
    }
    return {
      ...c,
      index: i,
      label: formatLabel(c.root, c.quality, c.bass, transpose),
      isCurrent,
      isNext,
      edited,
      isEditing: editingIndex === i,
      fontSize: isCurrent ? 30 : 26,
      textColor,
      underline,
    };
  });

  const lastManualScrollAt = useRef(0);
  const programmaticUntil = useRef(0);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onScroll = () => {
      // scrollIntoView({ behavior: 'smooth' }) fires a 'scroll' event per animation
      // frame, not once - a one-shot flag would catch only the first of those and
      // misread the rest as manual. Ignore every scroll event for a window covering
      // the animation instead, so none of its trailing events count as manual.
      if (Date.now() < programmaticUntil.current) return;
      lastManualScrollAt.current = Date.now();
    };
    container.addEventListener('scroll', onScroll);
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (Date.now() - lastManualScrollAt.current < 3000) return;
    const container = scrollRef.current;
    const cell = container?.querySelector(`[data-beat-index="${currentBeatIndex}"]`);
    if (cell) {
      programmaticUntil.current = Date.now() + 1000;
      cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentBeatIndex]);

  const hasChords = chords.length > 0;
  const nextIdx = hasChords ? Math.min(currentIndex + 1, decorated.length - 1) : 0;
  const nextIn = hasChords ? Math.max(0, chords[nextIdx].start - time) : 0;
  const currentLabel = hasChords ? decorated[currentIndex].label : '—';
  const nextLabel = hasChords ? decorated[nextIdx].label : '—';
  const transposeLabel = transpose === 0 ? 'no shift' : transpose > 0 ? `+${transpose} st` : `${transpose} st`;
  const keyLabel = `${transposeRoot(chart.key.tonic, transpose)} ${chart.key.mode}`;
  const bpmLabel = `${Math.round(chart.tempo.bpm)} bpm`;
  const scalesLabel = chart.scales.map((s) => transposeScaleName(s.name, transpose)).join(' · ');

  const roundBtnStyle: CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: '50%',
    border: '1.5px solid oklch(0.52 0.02 70 / 0.4)',
    background: 'oklch(0.988 0.006 85)',
    color: 'oklch(0.28 0.02 70)',
    fontSize: 15,
    lineHeight: 1,
    cursor: 'pointer',
  };

  return (
    <div
      data-screen-label="Chord sheet"
      data-has-media={mediaFile ? 'true' : 'false'}
      style={{ flex: 1, padding: '28px 5vw 48px', animation: 'tabit-fade-in 0.4s ease-out' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 22,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <img src="/wordmark.svg" alt="tabIt" style={{ height: 26, width: 'auto', display: 'block' }} />
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onBack();
            }}
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'oklch(0.52 0.02 70)',
              textDecoration: 'none',
              borderBottom: '1px dashed oklch(0.55 0.02 70 / 0.6)',
              paddingBottom: 1,
            }}
          >
            ‹ new song
          </a>
        </div>
        <div style={{ fontSize: 12, color: 'oklch(0.52 0.02 70)', letterSpacing: '0.02em' }}>
          {chart.source.title}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 30 }}>
        {chart.source.videoId ? (
          <YouTubePlayer videoId={chart.source.videoId} onReady={setSource} />
        ) : (
          mediaFile && <AudioPlayer file={mediaFile} onReady={setSource} />
        )}

        <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                padding: '8px 14px',
                background: 'oklch(0.988 0.006 85)',
                borderRadius: 2,
              }}
            >
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'oklch(0.52 0.02 70)',
                }}
              >
                Key
              </span>
              <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 17 }}>{keyLabel}</span>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                padding: '8px 14px',
                background: 'oklch(0.988 0.006 85)',
                borderRadius: 2,
              }}
            >
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'oklch(0.52 0.02 70)',
                }}
              >
                Tempo
              </span>
              <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 17 }}>{bpmLabel}</span>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                padding: '8px 14px',
                background: 'oklch(0.988 0.006 85)',
                borderRadius: 2,
                flex: 1,
                minWidth: 200,
              }}
            >
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'oklch(0.52 0.02 70)',
                }}
              >
                Scales to solo with
              </span>
              <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>{scalesLabel}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'oklch(0.52 0.02 70)',
              }}
            >
              Transpose
            </span>
            <button
              className="round-btn"
              onClick={() => setTranspose((t) => Math.max(-6, t - 1))}
              aria-label="Transpose down"
              style={roundBtnStyle}
            >
              –
            </button>
            <span
              style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 15, minWidth: 56, textAlign: 'center' }}
            >
              {transposeLabel}
            </span>
            <button
              className="round-btn"
              onClick={() => setTranspose((t) => Math.min(6, t + 1))}
              aria-label="Transpose up"
              style={roundBtnStyle}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          background: 'oklch(0.988 0.006 85)',
          borderRadius: 4,
          boxShadow: '0 1px 2px oklch(0.28 0.02 70 / 0.05), 0 10px 30px oklch(0.28 0.02 70 / 0.06)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 52,
            top: 0,
            bottom: 0,
            width: 1.5,
            background: 'oklch(0.70 0.10 25 / 0.5)',
            zIndex: 1,
          }}
        />
        {editingIndex !== null && (
          <div onClick={closeEditing} style={{ position: 'fixed', inset: 0, zIndex: 15 }} />
        )}
        <div
          ref={scrollRef}
          data-scroll-area
          style={{
            maxHeight: 420,
            overflowY: 'auto',
            padding: '26px 30px 26px 76px',
            scrollBehavior: 'smooth',
          }}
        >
          <BeatGrid
            beats={chart.beats}
            downbeats={chart.downbeats}
            meter={chart.meter}
            currentBeatIndex={currentBeatIndex}
            chords={decorated}
            onToggleEdit={toggleEdit}
            onRootUp={(i) => nudgeRoot(i, 1)}
            onRootDown={(i) => nudgeRoot(i, -1)}
            onQuality={applyQuality}
            onReset={clearOverride}
            onCloseEdit={closeEditing}
          />
        </div>
      </div>

      {hasChords && (
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            marginTop: 16,
            fontSize: 13.5,
            color: 'oklch(0.52 0.02 70)',
          }}
        >
          <span>
            Now: <strong style={{ color: 'oklch(0.28 0.02 70)', fontFamily: "'Fraunces', serif" }}>{currentLabel}</strong>
          </span>
          <span style={{ color: 'oklch(0.88 0.015 250)' }}>·</span>
          <span>
            Next: <strong style={{ color: 'oklch(0.55 0.02 70)', fontFamily: "'Fraunces', serif" }}>{nextLabel}</strong> in{' '}
            {nextIn.toFixed(1)}s
          </span>
        </div>
      )}
    </div>
  );
}
