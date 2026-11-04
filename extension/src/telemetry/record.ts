import type { Chart } from '../../../web/src/lib/types';
import type { ReportReason } from '../messages';
import { insertRow } from './client';
import { classifyError, scrubMessage } from './errors';
import { getInstallId, getShareUsage } from './settings';

/** Insert the chart row (deduped by video + engine version). Resolves false if it cannot be built or sent. */
async function uploadChart(chart: Chart): Promise<boolean> {
  const videoId = chart.source.videoId;
  if (!videoId) return false;
  return insertRow(
    'charts',
    {
      video_id: videoId,
      engine_version: chart.analysis.engineVersion,
      title: chart.source.title,
      chart,
    },
    { duplicateOk: true },
  );
}

/** Record a successful analysis. No-op unless the user opted in. Never rejects. */
export async function recordAnalysis(chart: Chart): Promise<void> {
  try {
    if (!(await getShareUsage())) return;
    const videoId = chart.source.videoId;
    if (!videoId) return;
    const installId = await getInstallId();
    await uploadChart(chart);
    await insertRow('analyses', {
      install_id: installId,
      video_id: videoId,
      engine_version: chart.analysis.engineVersion,
      outcome: 'ok',
    });
  } catch {
    // fire-and-forget: telemetry must never surface errors
  }
}

/** Record a failed analysis. No-op unless the user opted in. Never rejects. */
export async function recordFailure(
  videoId: string,
  message: string,
  engineVersion: string | null,
): Promise<void> {
  try {
    if (!(await getShareUsage())) return;
    const installId = await getInstallId();
    await insertRow('analyses', {
      install_id: installId,
      video_id: videoId,
      engine_version: engineVersion,
      outcome: 'failed',
      error_category: classifyError(message),
      error_message: scrubMessage(message),
    });
  } catch {
    // fire-and-forget
  }
}

/** Explicit user report: ignores the sharing setting. True only if the report row was accepted. */
export async function submitReport(chart: Chart, reportId: string): Promise<boolean> {
  try {
    const videoId = chart.source.videoId;
    if (!videoId) return false;
    const installId = await getInstallId();
    await uploadChart(chart);
    return await insertRow('reports', {
      id: reportId,
      install_id: installId,
      video_id: videoId,
      engine_version: chart.analysis.engineVersion,
    });
  } catch {
    return false;
  }
}

export async function submitReportDetails(
  reportId: string,
  reason: ReportReason,
  note: string,
): Promise<boolean> {
  try {
    return await insertRow('report_details', {
      report_id: reportId,
      reason,
      note: note === '' ? null : note,
    });
  } catch {
    return false;
  }
}
