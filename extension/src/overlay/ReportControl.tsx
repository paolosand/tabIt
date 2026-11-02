import { useEffect, useRef, useState } from 'react';
import type { Chart } from '../../../web/src/lib/types';
import type { ReportDetailsRequest, ReportReason, ReportRequest } from '../messages';
import {
  REPORT_BUTTON,
  REPORT_DETAILS_DONE,
  REPORT_FAILED,
  REPORT_FOLLOWUP_TITLE,
  REPORT_NOTE_LABEL,
  REPORT_REASON_LABELS,
  REPORT_SEND,
  REPORT_SENDING,
} from './copy';

type Phase = 'idle' | 'sending' | 'failed' | 'reported' | 'detailsSent';

async function send(message: ReportRequest | ReportDetailsRequest): Promise<boolean> {
  try {
    const res = (await chrome.runtime.sendMessage(message)) as { ok?: boolean } | undefined;
    return res?.ok === true;
  } catch {
    return false;
  }
}

/** One-click "report bad transcription" with an optional follow-up (reason + note).
 *  One report per chart: a new `chart` prop resets everything. */
export default function ReportControl({ chart }: { chart: Chart }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const reportId = useRef('');
  const inFlight = useRef(false);

  useEffect(() => {
    setPhase('idle');
    setReason(null);
    setNote('');
    reportId.current = '';
    inFlight.current = false;
  }, [chart]);

  async function onReport() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase('sending');
    const id = crypto.randomUUID();
    const ok = await send({ type: 'REPORT_BAD_TRANSCRIPTION', chart, reportId: id });
    inFlight.current = false;
    if (ok) reportId.current = id;
    setPhase(ok ? 'reported' : 'failed');
  }

  async function onSendDetails() {
    if (!reason) return;
    setPhase('detailsSent');
    await send({ type: 'REPORT_DETAILS', reportId: reportId.current, reason, note: note.trim() });
  }

  if (phase === 'detailsSent') {
    return <span className="tabit-report-status" role="status">{REPORT_DETAILS_DONE}</span>;
  }

  if (phase === 'reported') {
    return (
      <div className="tabit-report-followup" role="group" aria-label={REPORT_FOLLOWUP_TITLE}>
        <p className="tabit-report-title">{REPORT_FOLLOWUP_TITLE}</p>
        <div className="tabit-report-reasons">
          {(Object.keys(REPORT_REASON_LABELS) as ReportReason[]).map((r) => (
            <button
              key={r}
              type="button"
              className={`tabit-report-chip${reason === r ? ' tabit-report-chip-on' : ''}`}
              aria-pressed={reason === r}
              onClick={() => setReason(r)}
            >
              {REPORT_REASON_LABELS[r]}
            </button>
          ))}
        </div>
        <input
          type="text"
          className="tabit-report-note"
          aria-label={REPORT_NOTE_LABEL}
          placeholder={REPORT_NOTE_LABEL}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="button" className="tabit-report-send" disabled={!reason} onClick={() => void onSendDetails()}>
          {REPORT_SEND}
        </button>
      </div>
    );
  }

  return (
    <>
      <button type="button" className="tabit-report-btn" disabled={phase === 'sending'} onClick={() => void onReport()}>
        {phase === 'sending' ? REPORT_SENDING : REPORT_BUTTON}
      </button>
      {phase === 'failed' && <span className="tabit-report-status" role="status">{REPORT_FAILED}</span>}
    </>
  );
}
