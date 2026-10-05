import { useState, type MouseEvent } from 'react';
import { PITCH_NAMES, type PaletteEntry } from '../lib/gold/degrees.ts';
import type { GridQuality } from '../lib/gold/grid.ts';
import type { GoldFile, Mode } from '../lib/gold/types.ts';
import YouTubePlayer, { type PlayerControls } from '../playback/YouTubePlayer';
import type { Action } from './annotatorReducer.ts';
import type { SaveStatus } from './useAnnotator.ts';

const MUTED = 'oklch(0.55 0.02 70)';
const BORDER = 'oklch(0.85 0.01 80)';

const btn = {
  padding: '5px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, background: 'white',
  font: 'inherit', fontSize: 13, cursor: 'pointer',
} as const;
// keep keyboard focus on the page so chord keys keep working after a click
const keep = { tabIndex: -1, onMouseDown: (e: MouseEvent) => e.preventDefault() } as const;

export interface TopBarProps {
  file: GoldFile;
  palette: PaletteEntry[];
  flatPending: boolean;
  canUndo: boolean;
  canRedo: boolean;
  quality: GridQuality;
  saveStatus: SaveStatus;
  embedError: number | null;
  controls: PlayerControls | null;
  onDispatch: (a: Action) => void;
  onPlayer: (c: PlayerControls) => void;
  onEmbedError: (code: number) => void;
  onBack: () => void;
}

const SAVE_TEXT: Record<SaveStatus, string> = { idle: '', saving: 'Saving…', saved: 'Saved ✓', error: 'Save failed — kept in this browser, will retry' };

export default function TopBar(p: TopBarProps) {
  const { file } = p;
  const [pendingKey, setPendingKey] = useState<{ tonic: string; mode: Mode } | null>(null);
  const [slow, setSlow] = useState(false);

  function requestKey(tonic: string, mode: Mode) {
    if (tonic === file.key.tonic && mode === file.key.mode) return;
    if (file.spans.length === 0) p.onDispatch({ type: 'setKey', tonic, mode, transpose: false });
    else setPendingKey({ tonic, mode });
  }
  function applyKey(transpose: boolean) {
    if (pendingKey) p.onDispatch({ type: 'setKey', ...pendingKey, transpose });
    setPendingKey(null);
  }

  return (
    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, background: 'oklch(0.985 0.005 85)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 10 }}>
        <button style={btn} onClick={p.onBack}>← Back</button>
        <h1 style={{ margin: 0, fontSize: 18 }}>{file.title}</h1>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: p.saveStatus === 'error' ? 'oklch(0.5 0.18 25)' : MUTED }}>
          {SAVE_TEXT[p.saveStatus]}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <YouTubePlayer videoId={file.videoId} width={360} onReady={p.onPlayer} onError={p.onEmbedError} />
          {p.embedError !== null && (
            <div role="alert" style={{ marginTop: 6, fontSize: 12, color: 'oklch(0.5 0.18 25)' }}>
              This video can’t be embedded (YouTube error {p.embedError}).{' '}
              <a href={file.url} target="_blank" rel="noreferrer">Open on YouTube ↗</a>
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 320, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
            <label>Key{' '}
              <select aria-label="Key tonic" value={file.key.tonic} onChange={(e) => { requestKey(e.target.value, file.key.mode); e.currentTarget.blur(); }}>
                {PITCH_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>{' '}
              <select aria-label="Key mode" value={file.key.mode} onChange={(e) => { requestKey(file.key.tonic, e.target.value as Mode); e.currentTarget.blur(); }}>
                <option value="major">major</option>
                <option value="minor">minor</option>
              </select>
            </label>
            <span style={{ color: MUTED }}>({file.key.source === 'engine' ? 'engine’s guess — set this first' : 'set by you'})</span>
            <label>Beats per bar{' '}
              <select aria-label="Beats per bar" value={file.grid.beatsPerBar} onChange={(e) => { p.onDispatch({ type: 'setBeatsPerBar', value: Number(e.target.value) }); e.currentTarget.blur(); }}>
                {[2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <span>Beat 1 = grid beat #{file.grid.downbeatBeat + 1}{' '}
              <button {...keep} style={btn} aria-label="Move beat 1 earlier" onClick={() => p.onDispatch({ type: 'setDownbeat', value: file.grid.downbeatBeat - 1 })}>−</button>{' '}
              <button {...keep} style={btn} aria-label="Move beat 1 later" onClick={() => p.onDispatch({ type: 'setDownbeat', value: file.grid.downbeatBeat + 1 })}>+</button>
            </span>
          </div>

          <div style={{ fontSize: 12, color: p.quality.loose ? 'oklch(0.5 0.18 25)' : MUTED }}>
            {Math.round(p.quality.bpm)} BPM · beat spacing varies ±{(p.quality.cv * 100).toFixed(0)}%
            {p.quality.loose && ' — loose grid: chord timing on this song will be approximate'}
          </div>

          {pendingKey && (
            <div role="group" aria-label="Change key" style={{ padding: 8, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13 }}>
              Change the key to {pendingKey.tonic} {pendingKey.mode}? This song already has labels.{' '}
              <button style={btn} onClick={() => applyKey(false)}>Keep the chords</button>{' '}
              <button style={btn} onClick={() => applyKey(true)}>Transpose the chords</button>{' '}
              <button style={btn} onClick={() => setPendingKey(null)}>Cancel</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {p.palette.map((e) => (
              <button key={e.digit} {...keep} style={{ ...btn, minWidth: 54, lineHeight: 1.2 }}
                onClick={() => p.onDispatch({ type: 'digit', digit: e.digit })}>
                <b>{e.digit}</b> {e.numeral}<br /><small style={{ color: MUTED }}>{e.name}</small>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
            <button {...keep} style={{ ...btn, outline: p.flatPending ? '2px solid oklch(0.62 0.14 65)' : 'none' }} onClick={() => p.onDispatch({ type: 'flatPrefix' })}>b ♭ (next digit)</button>
            <button {...keep} style={btn} onClick={() => p.onDispatch({ type: 'toggle', which: 'm' })}>m minor</button>
            <button {...keep} style={btn} onClick={() => p.onDispatch({ type: 'toggle', which: 'd' })}>d ♭7</button>
            <button {...keep} style={btn} onClick={() => p.onDispatch({ type: 'toggle', which: 'j' })}>j maj7</button>
            <button {...keep} style={btn} onClick={() => p.onDispatch({ type: 'mark', kind: 'N' })}>n no chord</button>
            <button {...keep} style={btn} onClick={() => p.onDispatch({ type: 'mark', kind: 'X' })}>x unsure</button>
            <button {...keep} style={btn} disabled={!p.canUndo} onClick={() => p.onDispatch({ type: 'undo' })}>↶ undo</button>
            <button {...keep} style={btn} disabled={!p.canRedo} onClick={() => p.onDispatch({ type: 'redo' })}>↷ redo</button>
            <button {...keep} style={btn} disabled={!p.controls}
              onClick={() => { p.controls?.setPlaybackRate(slow ? 1 : 0.5); setSlow(!slow); }}>
              {slow ? '½× speed (on)' : '1× speed'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: MUTED }}>
            Keys: 1–7 place · b then 1–7 flat · m/d/j quality · n/x · Enter confirm · Backspace clear · ←→↑↓ move · Space play · ⌘Z undo
          </div>
        </div>
      </div>
    </div>
  );
}
