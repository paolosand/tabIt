/** The three collapsed-strip variants (`sheet` is a separate, larger view — see App.tsx).
 *  Rendered inside the shadow root; all visual styling lives in classes from styles.ts
 *  (shadow DOM has no access to a global stylesheet, and pseudo-states like :hover need
 *  real CSS classes rather than inline styles). */
export type BarProps =
  | { variant: 'collapsed'; onGetChords: () => void }
  | { variant: 'loading' }
  | { variant: 'error'; message: string; onRetry: () => void };

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
    return (
      <div className="tabit-bar tabit-bar-loading" data-state="loading">
        <Wordmark />
        <div className="tabit-loading-body">
          <div className="tabit-sweep-track" aria-hidden="true">
            <div className="tabit-sweep-fill" />
          </div>
          <span className="tabit-hint">
            first listen takes a minute or two — after that it&apos;s instant
          </span>
        </div>
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
