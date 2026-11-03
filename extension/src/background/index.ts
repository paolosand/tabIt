import type {
  DismissUpdateNoticeRequest, GetChartRequest, GetHelperStatusRequest, GetSharingRequest, HelperStatusResponse,
  ReportDetailsRequest, ReportReason, ReportRequest, SetSharingRequest,
  SharingErrorResponse, SharingResponse,
} from '../messages';
import {
  handleDismissUpdateNotice, handleGetChart, handleGetHelperStatus, handleGetSharing, handleReport, handleReportDetails, handleSetSharing,
} from './handler';

console.log('[tabit] background alive');

type Msg =
  | GetChartRequest | GetHelperStatusRequest | ReportRequest | ReportDetailsRequest
  | GetSharingRequest | SetSharingRequest | DismissUpdateNoticeRequest;

const REASONS: readonly ReportReason[] = ['chords', 'key', 'tempo', 'other'];
const MAX_NOTE = 500;
const SHARING_UNAVAILABLE: SharingErrorResponse = { error: 'unavailable' };

/** Always answers with the stored value; an explicit error shape if even that cannot be read. */
function currentSharing(): Promise<SharingResponse | SharingErrorResponse> {
  return handleGetSharing().catch((): SharingErrorResponse => SHARING_UNAVAILABLE);
}

chrome.runtime.onMessage.addListener((msg: Msg, sender, sendResponse) => {
  // Only this extension's own contexts may talk to the background.
  if (sender?.id !== chrome.runtime.id) return false;
  if (msg?.type === 'GET_CHART') {
    handleGetChart(msg.videoId).then(sendResponse);
    return true; // async response
  }
  if (msg?.type === 'GET_HELPER_STATUS') {
    handleGetHelperStatus()
      .catch((): HelperStatusResponse => ({ state: 'down', everSeen: false }))
      .then(sendResponse);
    return true;
  }
  if (msg?.type === 'REPORT_BAD_TRANSCRIPTION') {
    const valid = typeof msg.reportId === 'string' && msg.reportId !== ''
      && typeof msg.chart === 'object' && msg.chart !== null;
    (valid ? handleReport(msg) : Promise.reject(new Error('invalid report')))
      .catch(() => ({ ok: false })).then(sendResponse);
    return true;
  }
  if (msg?.type === 'REPORT_DETAILS') {
    const valid = typeof msg.reportId === 'string' && msg.reportId !== ''
      && REASONS.includes(msg.reason) && typeof msg.note === 'string';
    (valid ? handleReportDetails({ ...msg, note: msg.note.slice(0, MAX_NOTE) }) : Promise.reject(new Error('invalid details')))
      .catch(() => ({ ok: false })).then(sendResponse);
    return true;
  }
  if (msg?.type === 'GET_SHARING') {
    currentSharing().then(sendResponse);
    return true;
  }
  if (msg?.type === 'SET_SHARING') {
    if (typeof msg.shareUsage !== 'boolean') {
      currentSharing().then(sendResponse);
    } else {
      // A failed write must not claim a value: answer with what storage actually holds.
      handleSetSharing(msg.shareUsage).catch(currentSharing).then(sendResponse);
    }
    return true;
  }
  if (msg?.type === 'DISMISS_UPDATE_NOTICE') {
    handleDismissUpdateNotice().then(() => sendResponse(undefined));
    return true;
  }
  return false;
});
