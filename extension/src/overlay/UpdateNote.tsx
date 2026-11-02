import { useState } from 'react';
import { INSTALL_COMMAND } from '../install';
import {
  COPIED_LABEL,
  COPY_FALLBACK,
  COPY_UPDATE_COMMAND,
  DISMISS_LABEL,
  PASTE_IN_TERMINAL,
  UPDATE_NOTICE,
} from './copy';

export interface UpdateNoteProps {
  onCopy: () => Promise<boolean>;
  onDismiss: () => void;
}

/** A quiet, dismissible strip above the bar: the helper works but a newer one exists.
 *  The command is copied rather than shown (it is ~95 characters); it only appears,
 *  to select by hand, when the clipboard refuses. */
export function UpdateNote({ onCopy, onDismiss }: UpdateNoteProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'fallback'>('idle');
  const copy = () => {
    onCopy().then(
      (ok) => setState(ok ? 'copied' : 'fallback'),
      () => setState('fallback'),
    );
  };
  return (
    <div className="tabit-update-note" role="region" aria-label="Helper update">
      <span className="tabit-update-note-text">
        <strong>{state === 'copied' ? PASTE_IN_TERMINAL : UPDATE_NOTICE}</strong>
      </span>
      {state !== 'fallback' && (
        <button type="button" className="tabit-btn tabit-btn-secondary" onClick={copy}>
          {state === 'copied' ? COPIED_LABEL : COPY_UPDATE_COMMAND}
        </button>
      )}
      <button type="button" className="tabit-update-dismiss" aria-label={DISMISS_LABEL} onClick={onDismiss}>
        ×
      </button>
      {state === 'fallback' && (
        <p className="tabit-update-fallback">
          <code>{INSTALL_COMMAND}</code>
          <small>{COPY_FALLBACK}</small>
        </p>
      )}
    </div>
  );
}
