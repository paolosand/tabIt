/** The three collapsed-strip variants (`sheet` is a separate, larger view — see App.tsx).
 *  Rendered inside the shadow root; all visual styling lives in classes from styles.ts
 *  (shadow DOM has no access to a global stylesheet, and pseudo-states like :hover need
 *  real CSS classes rather than inline styles). */
import { Wordmark } from './Wordmark';

import { useEffect, useRef, useState } from 'react';
import { INSTALL_COMMAND } from '../install';
import * as copy from './copy';

export type BarProps =
  | { variant: 'collapsed'; onGetChords: () => void; justConnected?: boolean }
  | { variant: 'loading'; step?: string }
  | { variant: 'offline'; onRetry: () => void; onCopy: () => Promise<boolean> }
  | { variant: 'setup'; mode: 'install' | 'update'; onCopy: () => Promise<boolean> }
  | { variant: 'unsupported' }
  | { variant: 'error'; message: string; onRetry: () => void };

/** Server-reported pipeline step ids in run order, with user-facing labels.
 *  An unknown/missing id renders as step 1 active (spec: the UI never breaks
 *  on the field being absent). */
const PIPELINE_STEPS = [
  { id: 'ingest', label: 'Fetch audio' },
  { id: 'chords', label: 'Find chords' },
  { id: 'finalize', label: 'Build chart' },
] as const;

function LoadingBar({ step }: { step?: string }) {
  const steps = PIPELINE_STEPS;
  const active = Math.max(0, steps.findIndex((s) => s.id === step));
  return (
    <div className="tabit-bar tabit-bar-loading" data-state="loading">
      <Wordmark className="tabit-wordmark" />
      <div className="tabit-checklist" role="list" aria-label="analysis progress">
        {steps.map((s, i) => {
          const state = i < active ? 'done' : i === active ? 'active' : 'pending';
          return (
            <span
              key={s.id}
              role="listitem"
              className={`tabit-check-item tabit-check-${state}`}
              aria-current={state === 'active' ? 'step' : undefined}
            >
              <span className="tabit-check-icon" aria-hidden="true">✓</span>
              {s.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

const COPIED_REVERT_MS = 2000;

/** A Copy button plus, when the clipboard is unavailable, a plain "select it yourself" line. */
function CopyRow({ onCopy }: { onCopy: () => Promise<boolean> }) {
  const [result, setResult] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);
  const showCopied = () => {
    clearTimer();
    setResult('copied');
    timer.current = setTimeout(() => setResult('idle'), COPIED_REVERT_MS);
  };
  return (
    <span className="tabit-copy-row">
      <button
        type="button"
        className="tabit-btn tabit-btn-primary"
        onClick={() => {
          onCopy().then(
            (ok) => {
              if (ok) showCopied();
              else {
                clearTimer();
                setResult('failed');
              }
            },
            () => {
              clearTimer();
              setResult('failed');
            },
          );
        }}
      >
        {result === 'copied' ? copy.COPIED_LABEL : copy.COPY_BUTTON}
      </button>
      {result === 'failed' && <span>{copy.COPY_FALLBACK}</span>}
    </span>
  );
}

export function Bar(props: BarProps) {
  if (props.variant === 'collapsed') {
    return (
      <div className="tabit-bar" data-state="collapsed">
        <Wordmark className="tabit-wordmark" />
        <button
          type="button"
          className="tabit-btn tabit-btn-primary"
          onClick={props.onGetChords}
        >
          ♪ Get chords
        </button>
        {props.justConnected && <span>{copy.CONNECTED_NOTE}</span>}
      </div>
    );
  }

  if (props.variant === 'loading') {
    return <LoadingBar step={props.step} />;
  }

  if (props.variant === 'offline') {
    return (
      <div className="tabit-bar tabit-bar-offline" data-state="offline">
        <Wordmark className="tabit-wordmark" />
        <span className="tabit-offline-message">
          {copy.OFFLINE_MESSAGE} <code>{copy.RESTART_COMMAND}</code>
        </span>
        <CopyRow onCopy={props.onCopy} />
        <button
          type="button"
          className="tabit-btn tabit-btn-secondary"
          onClick={props.onRetry}
        >
          {copy.RETRY_LABEL}
        </button>
      </div>
    );
  }

  if (props.variant === 'setup') {
    return (
      <div className="tabit-bar tabit-bar-setup" data-state="setup">
        <Wordmark className="tabit-wordmark" />
        <div>
          <p>
            {props.mode === 'update' ? copy.SETUP_TITLE_UPDATE : copy.SETUP_TITLE_INSTALL}
          </p>
          <ol>
            {copy.SETUP_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <code>{INSTALL_COMMAND}</code>
          <CopyRow onCopy={props.onCopy} />
        </div>
      </div>
    );
  }

  if (props.variant === 'unsupported') {
    return (
      <div className="tabit-bar tabit-bar-unsupported" data-state="unsupported">
        <Wordmark className="tabit-wordmark" />
        <span>{copy.UNSUPPORTED_MESSAGE}</span>
      </div>
    );
  }

  return (
    <div className="tabit-bar tabit-bar-error" data-state="error">
      <Wordmark className="tabit-wordmark" />
      <span className="tabit-error-message" title={props.message}>{props.message}</span>
      <button
        type="button"
        className="tabit-btn tabit-btn-secondary"
        onClick={props.onRetry}
      >
        Retry
      </button>
    </div>
  );
}
