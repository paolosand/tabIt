import type { Chart } from '../../../web/src/lib/types';
import type { GetChartResponse } from '../messages';
import { fetchCachedChart, pollJobOnce, submitAnalysis } from './api';

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
      const state = await pollJobOnce(jobId);
      if (state.status === 'done') {
        await chrome.storage.session.set({ [`chart:${videoId}`]: state.chart });
        await chrome.storage.session.remove(`job:${videoId}`);
        return { status: 'done', chart: state.chart };
      }
      if (state.status === 'error') {
        await chrome.storage.session.remove(`job:${videoId}`);
        return { status: 'error', error: state.error };
      }
      return { status: 'pending' };
    }

    const chart = await fetchCachedChart(videoId);
    if (chart) {
      await chrome.storage.session.set({ [`chart:${videoId}`]: chart });
      return { status: 'done', chart };
    }

    const newJob = await submitAnalysis(videoId);
    await chrome.storage.session.set({ [`job:${videoId}`]: newJob });
    return { status: 'pending' };
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}
