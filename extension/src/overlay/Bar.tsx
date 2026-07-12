/** The three collapsed-strip variants (`sheet` is a separate, larger view — see App.tsx).
 *  Rendered inside the shadow root; all visual styling lives in classes from styles.ts
 *  (shadow DOM has no access to a global stylesheet, and pseudo-states like :hover need
 *  real CSS classes rather than inline styles). */
export type BarProps =
  | { variant: 'collapsed'; onGetChords: () => void }
  | { variant: 'loading'; step?: string }
  | { variant: 'offline'; onRetry: () => void }
  | { variant: 'error'; message: string; onRetry: () => void };

/** Server-reported pipeline step ids in run order, with user-facing labels.
 *  An unknown/missing id renders as step 1 active (spec: the UI never breaks
 *  on the field being absent). */
const PIPELINE_STEPS = [
  { id: 'ingest', label: 'Fetch audio' },
  { id: 'separate', label: 'Separate instruments' },
  { id: 'chords', label: 'Find chords' },
  { id: 'finalize', label: 'Build chart' },
] as const;

const Wordmark = () => <span className="tabit-wordmark">tabIt</span>;

export function Bar(props: BarProps) {
  if (props.variant === 'collapsed') {
    return (
      <div className="tabit-bar" data-state="collapsed">
        <Wordmark />
        <button
          type="button"
          className="tabit-btn tabit-btn-primary"
          onClick={props.onGetChords}
        >
          ♪ Get chords
        </button>
      </div>
    );
  }

  if (props.variant === 'loading') {
    const active = Math.max(0, PIPELINE_STEPS.findIndex((s) => s.id === props.step));
    return (
      <div className="tabit-bar tabit-bar-loading" data-state="loading">
        <Wordmark />
        <div className="tabit-checklist" role="list" aria-label="analysis progress">
          {PIPELINE_STEPS.map((s, i) => {
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

  if (props.variant === 'offline') {
    return (
      <div className="tabit-bar tabit-bar-offline" data-state="offline">
        <Wordmark />
        <span className="tabit-offline-message">
          tabIt helper isn&apos;t running — open the app, or run <code>tabit restart</code> in
          a terminal.
        </span>
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

  return (
    <div className="tabit-bar tabit-bar-error" data-state="error">
      <Wordmark />
      <span className="tabit-error-message">{props.message}</span>
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
