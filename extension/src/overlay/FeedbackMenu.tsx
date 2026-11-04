import { useEffect, useId, useRef, useState } from 'react';
import type { Chart } from '../../../web/src/lib/types';
import type { ReportReason } from '../messages';
import {
  FEEDBACK_BUTTON,
  FEEDBACK_TITLE,
  FEEDBACK_WRONG_CHORDS,
  PRIVACY_LABEL,
  PRIVACY_URL,
  REPORTED,
  REPORT_ALREADY,
  REPORT_BUTTON,
  REPORT_FAILED,
  REPORT_NOTE_LABEL,
  REPORT_NOTE_PLACEHOLDER,
  REPORT_POPUP_LABEL,
  REPORT_QUESTION,
  REPORT_REASON_LABELS,
  REPORT_SEND,
  REPORT_SENDING,
  REPORT_SENT,
  REPORT_SKIP,
  REPORT_THANKS,
  SHARING_ERROR,
  SHARING_LABEL,
  SHARING_LIST,
  SHARING_NEVER,
} from './copy';
import { FEEDBACK_ROOT_ATTR } from './keyboardIsolation';
import { useReport } from './useReport';
import { useSharing } from './useSharing';

type Pop = 'menu' | 'report';
// none: no report yet; open: report sent, details form showing; thanks: details sent;
// closed: form dismissed (the report itself was already sent).
type Form = 'none' | 'open' | 'thanks' | 'closed';

const THANKS_MS = 1800;

function Tick({ small }: { small?: boolean }) {
  return <span className={`tabit-tick${small ? ' tabit-tick-sm' : ''}`} aria-hidden="true" />;
}

function ReportPopup({
  thanks,
  onSend,
  onSkip,
}: {
  thanks: boolean;
  onSend: (reason: ReportReason, note: string) => void;
  onSkip: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  if (thanks) {
    // Own element, mounted when the thanks first appears, so only it fades in.
    return (
      <div className="tabit-pop-thanks tabit-pop-fade">
        <Tick />
        {REPORT_THANKS}
      </div>
    );
  }

  const submit = () => {
    if (reason) onSend(reason, note.trim());
  };

  return (
    <>
      <h4 className="tabit-pop-title tabit-pop-title-tick">
        <Tick small />
        {REPORT_SENT}
      </h4>
      <p className="tabit-pop-question">{REPORT_QUESTION}</p>
      <div className="tabit-pop-chips">
        {(Object.keys(REPORT_REASON_LABELS) as ReportReason[]).map((r) => (
          <button
            key={r}
            type="button"
            className="tabit-pop-chip"
            aria-pressed={reason === r}
            onClick={(e) => {
              setReason((cur) => (cur === r ? null : r));
              // A mouse click moves on to the note; keyboard activation keeps focus on the chip.
              if (e.detail > 0) noteRef.current?.focus();
            }}
          >
            {REPORT_REASON_LABELS[r]}
          </button>
        ))}
      </div>
      <textarea
        id="tabit-note"
        ref={noteRef}
        className="tabit-pop-note"
        rows={2}
        maxLength={500}
        aria-label={REPORT_NOTE_LABEL}
        placeholder={REPORT_NOTE_PLACEHOLDER}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          // Enter that confirms an IME composition must not send (keyCode 229 covers Safari-style ordering).
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === 'Enter' && !e.shiftKey && reason) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="tabit-pop-actions">
        <button type="button" className="tabit-text-btn" onClick={onSkip}>
          {REPORT_SKIP}
        </button>
        <button type="button" className="tabit-pop-send" disabled={!reason} onClick={submit}>
          {REPORT_SEND}
        </button>
      </div>
    </>
  );
}

/** The bottom-right of the panel's feedback row: status text, the "Feedback" button and its two
 *  pop-ups (menu, then the report form). The pop-ups float above the row (absolute, anchored to
 *  the row) so they never change the panel's height. One report per chart; a new `chart` resets. */
export default function FeedbackMenu({ chart }: { chart: Chart }) {
  const [pop, setPop] = useState<Pop | null>(null);
  const [form, setForm] = useState<Form>('none');
  const report = useReport(chart);
  const sharing = useSharing();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popNow = useRef<Pop | null>(null);
  popNow.current = pop;
  const checkId = useId();
  const popId = useId();

  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  // A different chart is a different song: forget any open pop-up and the form state.
  useEffect(() => {
    clearTimer();
    setPop(null);
    setForm('none');
  }, [chart]);
  useEffect(() => clearTimer, []);

  function close(refocus: boolean) {
    clearTimer();
    // Skipping the optional details is not un-reporting: the report was already sent.
    setForm((f) => (f === 'open' || f === 'thanks' ? 'closed' : f));
    setPop(null);
    if (refocus) triggerRef.current?.focus();
  }

  // Focus follows the pop-up in: the note for the report form, otherwise its first control.
  useEffect(() => {
    const el = popRef.current;
    if (!pop || !el) return;
    const target =
      pop === 'report'
        ? el.querySelector<HTMLElement>('textarea')
        : el.querySelector<HTMLElement>('button:not(:disabled), input');
    (target ?? el).focus();
  }, [pop]);
  // The thanks replaces the focused textarea, so park focus on the pop-up itself.
  useEffect(() => {
    if (form === 'thanks') popRef.current?.focus();
  }, [form]);

  // Outside click / Escape from elsewhere on the page closes the pop-up. composedPath, not
  // event.target: inside a shadow root the target is retargeted to the host.
  useEffect(() => {
    if (!pop) return;
    const outside = (e: Event) => !!rootRef.current && !e.composedPath().includes(rootRef.current);
    const onDown = (e: Event) => {
      if (outside(e)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && outside(e)) close(false);
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close only touches refs and setters
  }, [pop]);

  async function onReport() {
    const ok = await report.report();
    if (!ok) return;
    if (popNow.current === 'menu') {
      setForm('open');
      setPop('report');
    } else {
      setForm('closed'); // the menu was closed while the report was sending
    }
  }

  function onSendDetails(reason: ReportReason, note: string) {
    setForm('thanks');
    // Details are optional: whether or not this reaches the background we still thank the
    // user, because the report itself was already sent.
    void report.sendDetails(reason, note);
    clearTimer();
    timer.current = setTimeout(() => close(true), THANKS_MS);
  }

  const status = form === 'open' || form === 'thanks' ? REPORT_SENT : form === 'closed' ? REPORTED : '';
  const announce = form === 'thanks' ? REPORT_THANKS : status;
  const reported = report.state === 'reported';

  return (
    <div
      ref={rootRef}
      className="tabit-fb"
      {...{ [FEEDBACK_ROOT_ATTR]: '' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && pop) {
          e.stopPropagation();
          close(true);
        }
      }}
    >
      <span className="tabit-sr-only" aria-live="polite">{announce}</span>
      {status && <span className="tabit-fb-status" aria-hidden="true">{status}</span>}
      <button
        ref={triggerRef}
        type="button"
        className="tabit-text-btn"
        aria-haspopup="dialog"
        aria-expanded={pop !== null}
        aria-controls={pop ? popId : undefined}
        onClick={() => (pop ? close(false) : setPop('menu'))}
      >
        {FEEDBACK_BUTTON} <span aria-hidden="true">▾</span>
      </button>

      {pop && (
        // keyed per pop-up kind: the menu-to-report switch is a new pop-up (it fades in), while
        // everything inside one pop-up (chips, typing) re-renders in place and never remounts.
        <div
          key={pop}
          id={popId}
          ref={popRef}
          tabIndex={-1}
          role="dialog"
          aria-label={pop === 'menu' ? FEEDBACK_TITLE : REPORT_POPUP_LABEL}
          className={`tabit-pop tabit-pop-fade${pop === 'report' ? ' tabit-pop-report' : ''}`}
        >
          {pop === 'report' ? (
            <ReportPopup thanks={form === 'thanks'} onSend={onSendDetails} onSkip={() => close(true)} />
          ) : (
            <>
              <h4 className="tabit-pop-title">{FEEDBACK_TITLE}</h4>
              <div className="tabit-pop-row">
                <span>{FEEDBACK_WRONG_CHORDS}</span>
                {reported ? (
                  <span className="tabit-fb-status">{REPORT_ALREADY}</span>
                ) : (
                  <button
                    type="button"
                    className="tabit-text-btn"
                    disabled={report.state === 'sending'}
                    onClick={() => void onReport()}
                  >
                    {report.state === 'sending' ? REPORT_SENDING : REPORT_BUTTON}
                  </button>
                )}
              </div>
              {report.state === 'failed' && (
                <p className="tabit-pop-error" role="status">{REPORT_FAILED}</p>
              )}
              <div className="tabit-pop-row">
                <label className="tabit-switch" htmlFor={checkId}>
                  <input
                    id={checkId}
                    type="checkbox"
                    checked={sharing.on}
                    onChange={(e) => void sharing.change(e.target.checked)}
                  />
                  <span className="tabit-switch-box" aria-hidden="true" />
                  {SHARING_LABEL}
                </label>
              </div>
              {sharing.failed && <p className="tabit-pop-error" role="status">{SHARING_ERROR}</p>}
              <ul className="tabit-pop-list">
                {SHARING_LIST.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <p className="tabit-pop-never">{SHARING_NEVER}</p>
              <a className="tabit-pop-link" href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
                {PRIVACY_LABEL}
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
