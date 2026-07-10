import { useState } from 'react';
import Landing from './screens/Landing';
import Analyzing from './screens/Analyzing';
import { analyzeUrl, analyzeFile, pollJob } from './lib/api';
import type { Chart } from './lib/types';

type Stage = 'landing' | 'analyzing' | 'sheet';

export default function App() {
  const [stage, setStage] = useState<Stage>('landing');
  const [chart, setChart] = useState<Chart | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [urlValue, setUrlValue] = useState('');

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
      {stage === 'sheet' && chart && (
        <div data-screen-label="Chord sheet" data-has-media={mediaFile ? 'true' : 'false'}>
          {chart.scales[0].name}
        </div>
      )}
    </div>
  );
}
