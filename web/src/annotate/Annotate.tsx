import { useEffect, useState } from 'react';
import { analyzeUrl, pollJob } from '../lib/api';
import { newGoldFromChart } from '../lib/gold/file.ts';
import type { GoldFile, GoldSummary } from '../lib/gold/types.ts';
import Analyzing from '../screens/Analyzing';
import AnnotateEditor from './AnnotateEditor.tsx';
import { listGold, loadGold } from './goldApi.ts';

type Phase =
  | { phase: 'home' }
  | { phase: 'loading' }
  | { phase: 'edit'; file: GoldFile; needsSave: boolean };

export default function Annotate() {
  const [phase, setPhase] = useState<Phase>({ phase: 'home' });
  const [songs, setSongs] = useState<GoldSummary[]>([]);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (phase.phase !== 'home') return;
    listGold().then(setSongs, () => setError('The gold store is unavailable — is this the Vite dev server (`npm run dev`)?'));
  }, [phase.phase]);

  async function start() {
    setError(null);
    setPhase({ phase: 'loading' });
    try {
      const chart = await pollJob(await analyzeUrl(url.trim()));
      const id = chart.source.videoId;
      const existing = id ? await loadGold(id) : null;
      // newGoldFromChart throws the "needs a YouTube URL" error when the chart has no video ID
      setPhase({ phase: 'edit', ...(existing ?? { file: newGoldFromChart(chart, url.trim()), needsSave: false }) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase({ phase: 'home' });
    }
  }

  async function resume(id: string) {
    setError(null);
    try {
      const loaded = await loadGold(id);
      if (!loaded) throw new Error('That song’s saved file is missing.');
      setPhase({ phase: 'edit', ...loaded });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (phase.phase === 'loading') return <Analyzing />;
  if (phase.phase === 'edit') {
    return (
      <AnnotateEditor
        key={phase.file.videoId}
        file={phase.file}
        needsSave={phase.needsSave}
        onBack={() => setPhase({ phase: 'home' })}
      />
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '48px auto', padding: '0 16px' }}>
      <h1 style={{ fontSize: 24 }}>Gold-set annotator</h1>
      <p style={{ color: 'oklch(0.55 0.02 70)' }}>
        Dev-only. Confirm or correct the engine’s chords by ear; labels save to <code>benchmarks/gold/annotations/</code>.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); void start(); }} style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <label style={{ flex: 1 }}>
          <span style={{ position: 'absolute', left: -9999 }}>YouTube URL</span>
          <input
            aria-label="YouTube URL" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…" style={{ width: '100%', padding: 8 }}
          />
        </label>
        <button type="submit" disabled={!url.trim()}>Start</button>
      </form>
      {error && <p role="alert" style={{ color: 'oklch(0.5 0.18 25)' }}>{error}</p>}
      {songs.length > 0 && (
        <>
          <h2 style={{ fontSize: 16 }}>Saved songs</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {songs.map((s) => (
              <li key={s.videoId} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '6px 0' }}>
                <span style={{ flex: 1 }}>{s.title}</span>
                <span style={{ fontSize: 12, color: 'oklch(0.55 0.02 70)' }}>{Math.round(s.labeledSeconds)} s labeled</span>
                <button onClick={() => void resume(s.videoId)} aria-label={`Resume ${s.title}`}>Resume</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
