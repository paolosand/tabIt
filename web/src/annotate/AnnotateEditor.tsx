import { useEffect, useMemo, useState } from 'react';
import { beatIndexAt } from '../lib/beats';
import { paletteFor } from '../lib/gold/degrees.ts';
import { buildRows, effectiveBeats, gridQuality, meanInterval } from '../lib/gold/grid.ts';
import { computeGhosts } from '../lib/gold/spans.ts';
import type { GoldFile } from '../lib/gold/types.ts';
import type { PlayerControls } from '../playback/YouTubePlayer';
import { usePlaybackTime } from '../playback/usePlaybackTime';
import AnnotateSheet from './AnnotateSheet.tsx';
import TopBar from './TopBar.tsx';
import { isTypingTarget, keyToAction } from './keymap.ts';
import { buildSegments } from './layout.ts';
import { useAnnotator } from './useAnnotator.ts';

export interface AnnotateEditorProps {
  file: GoldFile;
  /** true when the file came from a newer localStorage draft and must be re-saved */
  needsSave: boolean;
  onBack: () => void;
}

export default function AnnotateEditor({ file, needsSave, onBack }: AnnotateEditorProps) {
  const { state, dispatch, saveStatus } = useAnnotator(file, needsSave);
  const [controls, setControls] = useState<PlayerControls | null>(null);
  const [embedError, setEmbedError] = useState<number | null>(null);
  const time = usePlaybackTime(controls);
  const f = state.file;

  const beats = useMemo(() => effectiveBeats(f.beats, f.grid), [f.beats, f.grid]);
  const tol = 0.45 * meanInterval(beats);
  const ghosts = useMemo(() => computeGhosts(f.engine.chords, f.spans, f.blind), [f.engine.chords, f.spans, f.blind]);
  const segs = useMemo(() => buildSegments(f, beats, ghosts, tol), [f, beats, ghosts, tol]);
  const rows = useMemo(() => buildRows(beats.length, f.grid.beatsPerBar, f.grid.downbeatBeat), [beats.length, f.grid.beatsPerBar, f.grid.downbeatBeat]);
  const quality = useMemo(() => gridQuality(beats), [beats]);
  const palette = useMemo(() => paletteFor(f.key), [f.key]);
  const playheadBeat = beatIndexAt(beats, time);

  // keyboard: chord entry, movement, undo, play/pause. Ignored while typing in a control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const action = keyToAction(e);
      if (!action) return;
      e.preventDefault();
      if (action.type === 'playPause') {
        if (controls) {
          if (controls.isPlaying()) controls.pause();
          else controls.play();
        }
        return;
      }
      dispatch(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controls, dispatch]);

  // the cursor follows the playhead while the video plays
  useEffect(() => {
    if (controls?.isPlaying() && playheadBeat >= 0) dispatch({ type: 'setCursor', beat: playheadBeat });
  }, [playheadBeat, controls, dispatch]);

  // keep the cursor's row in view
  useEffect(() => {
    document.getElementById('cursor-marker')?.scrollIntoView?.({ block: 'nearest' });
  }, [state.cursor]);

  if (beats.length < 2) {
    return (
      <div style={{ padding: 24 }}>
        <p>This song has no beat grid, so it can’t be annotated. Try another upload of the song.</p>
        <button onClick={onBack}>← Back</button>
      </div>
    );
  }

  return (
    <div data-screen-label="Annotate">
      <TopBar
        file={f}
        palette={palette}
        flatPending={state.flatPending}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        quality={quality}
        saveStatus={saveStatus}
        embedError={embedError}
        controls={controls}
        onDispatch={dispatch}
        onPlayer={setControls}
        onEmbedError={setEmbedError}
        onBack={onBack}
      />
      <AnnotateSheet
        rows={rows}
        beats={beats}
        segs={segs}
        keyInfo={f.key}
        cursor={state.cursor}
        playheadBeat={playheadBeat}
        onSelectBeat={(beat) => {
          dispatch({ type: 'setCursor', beat });
          if (controls && beats[beat] !== undefined) controls.seekTo(beats[beat]); // click = play from here
        }}
      />
    </div>
  );
}
