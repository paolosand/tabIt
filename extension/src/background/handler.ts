import type { Chart } from '../../../web/src/lib/types';
import type {
  GetChartResponse, HelperStatusResponse, OkResponse, ReportDetailsRequest, ReportRequest, SharingResponse,
} from '../messages';
import { recordAnalysis, recordFailure, submitReport, submitReportDetails } from '../telemetry/record';
import { getShareUsage, setShareUsage } from '../telemetry/settings';
import { MIN_ENGINE_VERSION, RECOMMENDED_ENGINE_VERSION, isOlderThan } from '../version';
import { getHelperStatus } from './helper';
import { fetchCachedChart, pollJobOnce, submitAnalysis } from './api';

/** Fire-and-forget: never awaited by callers, never throws, never delays a response. */
function fire(task: () => Promise<unknown>): void {
  void Promise.resolve().then(task).catch(() => {});
}

function recordFailureBestEffort(videoId: string, message: string): void {
  fire(async () => {
    let engineVersion: string | null = null;
    try {
      const status = await getHelperStatus();
      if (status.state === 'up') engineVersion = status.engineVersion;
    } catch {
      // Engine version is best-effort.
    }
    await recordFailure(videoId, message, engineVersion);
  });
}

async function sessionGet<T>(key: string): Promise<T | undefined> {
  const out = await chrome.storage.session.get(key);
  return out[key] as T | undefined;
}

/** Idempotent: safe to call every 3s from the content script; survives SW restarts
 *  because all state (chart, jobId) lives in chrome.storage.session. */
export async function handleGetChart(videoId: string): Promise<GetChartResponse> {
  try {
    const cached = await sessionGet<Chart>(`chart:${videoId}`);
    if (cached) return { status: 'done', chart: cached };

    const jobId = await sessionGet<string>(`job:${videoId}`);
    if (jobId) {
      let state;
      try {
        state = await pollJobOnce(jobId);
      } catch (e) {
        // The in-memory JobStore can be lost to an API restart (e.g. a thrown
        // `API 404`), unlike a resolved {status:'error'} which already clears the
        // key below. Clear it here too so the next GET_CHART falls through the
        // normal idempotent path (server cache check -> resubmit) instead of
        // re-polling a dead job forever.
        await chrome.storage.session.remove(`job:${videoId}`);
        throw e;
      }
      if (state.status === 'done') {
        await chrome.storage.session.set({ [`chart:${videoId}`]: state.chart });
        await chrome.storage.session.remove(`job:${videoId}`);
        fire(() => recordAnalysis(state.chart));
        return { status: 'done', chart: state.chart };
      }
      if (state.status === 'error') {
        await chrome.storage.session.remove(`job:${videoId}`);
        recordFailureBestEffort(videoId, state.error);
        return { status: 'error', error: state.error };
      }
      return { status: 'pending', step: state.step };
    }

    const chart = await fetchCachedChart(videoId);
    if (chart) {
      await chrome.storage.session.set({ [`chart:${videoId}`]: chart });
      fire(() => recordAnalysis(chart));
      return { status: 'done', chart };
    }

    const newJob = await submitAnalysis(videoId);
    await chrome.storage.session.set({ [`job:${videoId}`]: newJob });
    return { status: 'pending' };
  } catch (e) {
    // fetch rejects with TypeError on network-level failure: the local helper
    // isn't reachable at all — distinct from an HTTP error a live server sent
    // (api.ts throws those as plain Error('API <status>')).
    if (e instanceof TypeError) return { status: 'offline' };
    const message = e instanceof Error ? e.message : String(e);
    recordFailureBestEffort(videoId, message);
    return { status: 'error', error: message };
  }
}

export async function handleReport(req: ReportRequest): Promise<OkResponse> {
  return { ok: await submitReport(req.chart, req.reportId) };
}

export async function handleReportDetails(req: ReportDetailsRequest): Promise<OkResponse> {
  return { ok: await submitReportDetails(req.reportId, req.reason, req.note) };
}

export async function handleGetSharing(): Promise<SharingResponse> {
  return { shareUsage: await getShareUsage() };
}

export async function handleSetSharing(on: boolean): Promise<SharingResponse> {
  await setShareUsage(on);
  return { shareUsage: await getShareUsage() };
}

/** Reports whether the local helper is up (and too old), remembering in
 *  chrome.storage.local that it was ever seen so the UI can tell first-run
 *  from "helper stopped". */
export async function handleGetHelperStatus(): Promise<HelperStatusResponse> {
  const status = await getHelperStatus();
  if (status.state === 'up') {
    try {
      await chrome.storage.local.set({ helperSeen: true });
    } catch {
      // Remembering is best-effort; the helper is up regardless.
    }
    const tooOld = isOlderThan(status.engineVersion, MIN_ENGINE_VERSION);
    const updateAvailable =
      !tooOld &&
      isOlderThan(status.engineVersion, RECOMMENDED_ENGINE_VERSION) &&
      !(await updateNoticeDismissed());
    return { state: 'up', tooOld, updateAvailable };
  }
  let everSeen = false;
  try {
    const { helperSeen } = await chrome.storage.local.get('helperSeen');
    everSeen = helperSeen === true;
  } catch {
    // Unreadable storage: treat as never seen.
  }
  return { state: 'down', everSeen };
}

/** True when the user dismissed the notice for the current recommended version. An
 *  unreadable store counts as "not dismissed", so a storage failure never hides the notice. */
async function updateNoticeDismissed(): Promise<boolean> {
  try {
    const { updateNoticeDismissed: seen } = await chrome.storage.local.get('updateNoticeDismissed');
    return seen === RECOMMENDED_ENGINE_VERSION;
  } catch {
    return false;
  }
}

/** Remembers the dismissal per recommended version, so a later bump shows the notice again. */
export async function handleDismissUpdateNotice(): Promise<void> {
  try {
    await chrome.storage.local.set({ updateNoticeDismissed: RECOMMENDED_ENGINE_VERSION });
  } catch {
    // Best-effort: worst case the notice returns on the next page load.
  }
}
