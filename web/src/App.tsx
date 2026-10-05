import { lazy, Suspense, useEffect, useState } from 'react';
import Landing from './screens/Landing';
import Analyzing from './screens/Analyzing';
import Sheet from './screens/Sheet';
import { analyzeUrl, analyzeFile, pollJob } from './lib/api';
import type { Chart } from './lib/types';

type Stage = 'landing' | 'analyzing' | 'sheet';

// Dev-only annotator. `import.meta.env.DEV` is a build-time constant, so this whole
// branch (and the lazy chunk behind it) is dropped from production builds.
const Annotate = import.meta.env.DEV ? lazy(() => import('./annotate/Annotate.tsx')) : null;

export default function App() {
  const [stage, setStage] = useState<Stage>('landing');
  const [chart, setChart] = useState<Chart | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [urlValue, setUrlValue] = useState('');
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  async function run(submit: () => Promise<string>, file: File | null) {
    setError(null);
    setMediaFile(file);
    setStage('analyzing');
    try {
      const nextChart = await pollJob(await submit());
      setChart(nextChart);
      setStage('sheet');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage('landing');
    }
  }

  const onSubmitUrl = (url: string) => run(() => analyzeUrl(url), null);
  const onSubmitFile = (file: File) => run(() => analyzeFile(file), file);

  const onBack = () => {
    setStage('landing');
    setChart(null);
    setMediaFile(null);
    setError(null);
  };

  if (Annotate && hash === '#annotate') {
    return (
      <div style={{ minHeight: '100vh', background: 'oklch(0.972 0.008 85)', color: 'oklch(0.28 0.02 70)', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
        <Suspense fallback={null}>
          <Annotate />
        </Suspense>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'oklch(0.972 0.008 85)',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        color: 'oklch(0.28 0.02 70)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {stage === 'landing' && (
        <Landing
          value={urlValue}
          onChange={setUrlValue}
          onSubmitUrl={onSubmitUrl}
          onSubmitFile={onSubmitFile}
          error={error}
        />
      )}
      {stage === 'analyzing' && <Analyzing />}
      {stage === 'sheet' && chart && <Sheet chart={chart} mediaFile={mediaFile} onBack={onBack} />}
    </div>
  );
}
