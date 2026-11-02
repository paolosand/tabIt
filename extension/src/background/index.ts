import type {
  GetChartRequest, GetHelperStatusRequest, GetSharingRequest, HelperStatusResponse,
  ReportDetailsRequest, ReportRequest, SetSharingRequest,
} from '../messages';
import {
  handleGetChart, handleGetHelperStatus, handleGetSharing, handleReport, handleReportDetails, handleSetSharing,
} from './handler';

console.log('[tabit] background alive');

type Msg =
  | GetChartRequest | GetHelperStatusRequest | ReportRequest | ReportDetailsRequest
  | GetSharingRequest | SetSharingRequest;

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
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
    handleReport(msg).catch(() => ({ ok: false })).then(sendResponse);
    return true;
  }
  if (msg?.type === 'REPORT_DETAILS') {
    handleReportDetails(msg).catch(() => ({ ok: false })).then(sendResponse);
    return true;
  }
  if (msg?.type === 'GET_SHARING') {
    handleGetSharing().catch(() => ({ shareUsage: false })).then(sendResponse);
    return true;
  }
  if (msg?.type === 'SET_SHARING') {
    handleSetSharing(msg.shareUsage).catch(() => ({ shareUsage: false })).then(sendResponse);
    return true;
  }
  return false;
});
