import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Chart } from '../../../web/src/lib/types';
import type { GetChartRequest, GetChartResponse } from '../messages';
import { Bar } from './Bar';

const POLL_INTERVAL_MS = 3000;

type State =
  | { kind: 'collapsed' }
  | { kind: 'loading' }
  | { kind: 'sheet'; chart: Chart }
  | { kind: 'error'; message: string };

export interface AppProps {
  videoId: string;
}

/** Overlay state machine: collapsed bar -> (click) -> loading (polls GET_CHART every
 *  3s) -> sheet | error. Session-cached charts resolve on the first poll, so a chart
 *  that's already been analyzed once feels effectively instant. */
export function App({ videoId }: AppProps) {
  const [state, setState] = useState<State>({ kind: 'collapsed' });

  // Guards against a poll response landing after unmount (component torn down by a
  // SPA navigation) and against a stale setTimeout firing after retry/unmount.
  const aliveRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const poll = useCallback(() => {
    const request: GetChartRequest = { type: 'GET_CHART', videoId };
    chrome.runtime
      .sendMessage(request)
      .then((response: GetChartResponse) => {
        if (!aliveRef.current) return;
        if (response.status === 'done') {
          setState({ kind: 'sheet', chart: response.chart });
        } else if (response.status === 'error') {
          setState({ kind: 'error', message: response.error });
        } else {
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      })
      .catch((e: unknown) => {
        if (!aliveRef.current) return;
        setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      });
  }, [videoId]);

  const startPolling = useCallback(() => {
    setState({ kind: 'loading' });
    poll();
  }, [poll]);

  switch (state.kind) {
    case 'collapsed':
      return <Bar variant="collapsed" onGetChords={startPolling} />;
    case 'loading':
      return <Bar variant="loading" />;
    case 'error':
      return <Bar variant="error" message={state.message} onRetry={startPolling} />;
    case 'sheet':
      // Placeholder for Task 5, which swaps this for the real chord-sheet Panel.
      return (
        <div className="tabit-sheet-placeholder" data-state="sheet">
          {state.chart.scales[0].name}
        </div>
      );
  }
}

/** Mounts the overlay React tree into `shadowRoot` for the given `videoId` and returns
 *  a `stop()` that unmounts it. `shadowRoot` already has its stylesheet injected by
 *  mount.ts; this only owns the React root and its container div. */
export function renderOverlay(shadowRoot: ShadowRoot, videoId: string): () => void {
  const container = document.createElement('div');
  shadowRoot.appendChild(container);
  const root = createRoot(container);
  root.render(<App videoId={videoId} />);
  return () => root.unmount();
}
