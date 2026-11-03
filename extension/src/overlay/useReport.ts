import { useEffect, useRef, useState } from 'react';
import type { Chart } from '../../../web/src/lib/types';
import type { ReportDetailsRequest, ReportReason, ReportRequest } from '../messages';

export type ReportState = 'idle' | 'sending' | 'failed' | 'reported';

async function send(message: ReportRequest | ReportDetailsRequest): Promise<boolean> {
  try {
    const res = (await chrome.runtime.sendMessage(message)) as { ok?: boolean } | undefined;
    return res?.ok === true;
  } catch {
    return false;
  }
}

/** One report per chart: sends REPORT_BAD_TRANSCRIPTION once and keeps its reportId for the
 *  optional follow-up. A new `chart` object resets everything, and a reply that lands after
 *  the chart changed is ignored (it must not mark the new chart as reported). */
export function useReport(chart: Chart): {
  state: ReportState;
  report: () => Promise<boolean>;
  sendDetails: (reason: ReportReason, note: string) => Promise<void>;
} {
  const [state, setState] = useState<ReportState>('idle');
  const reportId = useRef('');
  const inFlight = useRef(false);
  const epoch = useRef(0);

  useEffect(() => {
    epoch.current += 1;
    setState('idle');
    reportId.current = '';
    inFlight.current = false;
  }, [chart]);

  async function report(): Promise<boolean> {
    if (inFlight.current) return false;
    inFlight.current = true;
    const mine = epoch.current;
    setState('sending');
    const id = crypto.randomUUID();
    const ok = await send({ type: 'REPORT_BAD_TRANSCRIPTION', chart, reportId: id });
    if (mine !== epoch.current) return false;
    inFlight.current = false;
    if (ok) reportId.current = id;
    setState(ok ? 'reported' : 'failed');
    return ok;
  }

  async function sendDetails(reason: ReportReason, note: string): Promise<void> {
    await send({ type: 'REPORT_DETAILS', reportId: reportId.current, reason, note });
  }

  return { state, report, sendDetails };
}
