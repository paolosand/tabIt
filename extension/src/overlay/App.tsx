import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Chart } from '../../../web/src/lib/types';
import type {
  GetChartRequest,
  GetChartResponse,
  GetHelperStatusRequest,
  HelperStatusResponse,
} from '../messages';
import { INSTALL_COMMAND } from '../install';
import { isMac } from '../platform';
import { RESTART_COMMAND } from './copy';
import { Bar } from './Bar';
import Panel from './Panel';

const POLL_INTERVAL_MS = 3000;
const OFFLINE_POLL_BASE_MS = 3000;
const OFFLINE_POLL_MAX_MS = 30000;

type State =
  | { kind: 'collapsed'; justConnected?: boolean }
  | { kind: 'setup'; mode: 'install' | 'update' }
  | { kind: 'unsupported' }
  | { kind: 'loading'; step?: string }
  | { kind: 'sheet'; chart: Chart }
  | { kind: 'offline'; probing?: boolean } // probing: shown by the status probe, which keeps polling
  | { kind: 'error'; message: string };

/** Resolves false (never throws) when the clipboard is unavailable or refuses. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface AppProps {
  videoId: string;
}

/** Overlay state machine: collapsed bar -> (click) -> loading (polls GET_CHART every
 *  3s) -> sheet | error. Session-cached charts resolve on the first poll, so a chart
 *  that's already been analyzed once feels effectively instant. */
export function App({ videoId }: AppProps) {
  const [state, setState] = useState<State>(() =>
    isMac() ? { kind: 'collapsed' } : { kind: 'unsupported' },
  );
  // Latest state for async callbacks (timers/promises) that must not use stale closures.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Guards against a poll response landing after unmount (component torn down by a
  // SPA navigation) and against a stale setTimeout firing after retry/unmount.
  const aliveRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Consecutive offline polls, for backoff; any non-offline response resets it.
  const offlineAttemptRef = useRef(0);
  // Consecutive status polls spent in setup, for backoff.
  const statusAttemptRef = useRef(0);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  // First-run probe: asks the background whether the local helper is up. While the
  // setup bar is showing it re-polls with the offline backoff until the helper is
  // up and current. Only ever changes state while the bar is collapsed or in setup,
  // so it can't clobber a chart the user has already asked for.
  const checkStatus = useCallback(() => {
    const request: GetHelperStatusRequest = { type: 'GET_HELPER_STATUS' };
    const retryLater = () => {
      const delay = Math.min(
        OFFLINE_POLL_BASE_MS * 2 ** statusAttemptRef.current,
        OFFLINE_POLL_MAX_MS,
      );
      statusAttemptRef.current += 1;
      timerRef.current = setTimeout(checkStatus, delay);
    };
    chrome.runtime
      .sendMessage(request)
      .then((response: HelperStatusResponse | undefined) => {
        if (!aliveRef.current) return;
        const prev = stateRef.current;
        const watching = prev.kind === 'setup' || (prev.kind === 'offline' && prev.probing === true);
        if (prev.kind !== 'collapsed' && !watching) return;
        if (!response || (response.state !== 'up' && response.state !== 'down')) {
          if (watching) retryLater();
          return;
        }
        if (response.state === 'down' && response.everSeen) {
          // Installed before but not running now: say so immediately, keep watching.
          retryLater();
          if (!(prev.kind === 'offline' && prev.probing)) setState({ kind: 'offline', probing: true });
          return;
        }
        const needsSetup = response.state === 'up' ? response.tooOld : !response.everSeen;
        if (needsSetup) {
          const mode = response.state === 'up' ? 'update' : 'install';
          retryLater();
          if (prev.kind !== 'setup' || prev.mode !== mode) setState({ kind: 'setup', mode });
          return;
        }
        statusAttemptRef.current = 0;
        if (watching) setState({ kind: 'collapsed', justConnected: true });
      })
      .catch(() => {
        if (!aliveRef.current) return;
        const cur = stateRef.current;
        if (cur.kind === 'setup' || (cur.kind === 'offline' && cur.probing)) retryLater();
      });
  }, []);

  useEffect(() => {
    if (stateRef.current.kind === 'unsupported') return;
    checkStatus();
  }, [checkStatus]);

  const poll = useCallback(() => {
    const request: GetChartRequest = { type: 'GET_CHART', videoId };
    chrome.runtime
      .sendMessage(request)
      .then((response: GetChartResponse) => {
        if (!aliveRef.current) return;
        if (response.status === 'offline') {
          const delay = Math.min(
            OFFLINE_POLL_BASE_MS * 2 ** offlineAttemptRef.current,
            OFFLINE_POLL_MAX_MS,
          );
          offlineAttemptRef.current += 1;
          setState({ kind: 'offline' });
          timerRef.current = setTimeout(poll, delay);
          // A helper that was never installed is not "stopped": show the setup bar.
          const statusRequest: GetHelperStatusRequest = { type: 'GET_HELPER_STATUS' };
          chrome.runtime
            .sendMessage(statusRequest)
            .then((status: HelperStatusResponse | undefined) => {
              const kind = stateRef.current.kind; // may still be 'loading': the offline render can lag
              if (!aliveRef.current || (kind !== 'offline' && kind !== 'loading')) return;
              if (status?.state !== 'down' || status.everSeen) return;
              if (timerRef.current !== null) clearTimeout(timerRef.current);
              statusAttemptRef.current = 0;
              setState({ kind: 'setup', mode: 'install' });
              timerRef.current = setTimeout(checkStatus, OFFLINE_POLL_BASE_MS);
            })
            .catch(() => {});
          return;
        }
        offlineAttemptRef.current = 0;
        if (response.status === 'done') {
          setState({ kind: 'sheet', chart: response.chart });
        } else if (response.status === 'error') {
          setState({ kind: 'error', message: response.error });
        } else {
          setState({ kind: 'loading', step: response.step });
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      })
      .catch((e: unknown) => {
        if (!aliveRef.current) return;
        setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      });
  }, [videoId, checkStatus]);

  const startPolling = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    offlineAttemptRef.current = 0;
    setState({ kind: 'loading' });
    poll();
  }, [poll]);

  switch (state.kind) {
    case 'collapsed':
      return (
        <Bar variant="collapsed" onGetChords={startPolling} justConnected={state.justConnected} />
      );
    case 'setup':
      return <Bar variant="setup" mode={state.mode} onCopy={() => copyText(INSTALL_COMMAND)} />;
    case 'unsupported':
      return <Bar variant="unsupported" />;
    case 'loading':
      return <Bar variant="loading" step={state.step} />;
    case 'offline':
      return <Bar variant="offline" onRetry={startPolling} onCopy={() => copyText(RESTART_COMMAND)} />;
    case 'error':
      return <Bar variant="error" message={state.message} onRetry={startPolling} />;
    case 'sheet':
      return <Panel chart={state.chart} onCollapse={() => setState({ kind: 'collapsed' })} />;
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
