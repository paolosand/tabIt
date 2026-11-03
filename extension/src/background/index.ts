import type {
  DismissUpdateNoticeRequest,
  GetChartRequest,
  GetHelperStatusRequest,
  HelperStatusResponse,
} from '../messages';
import { handleDismissUpdateNotice, handleGetChart, handleGetHelperStatus } from './handler';

console.log('[tabit] background alive');

chrome.runtime.onMessage.addListener((msg: GetChartRequest | GetHelperStatusRequest | DismissUpdateNoticeRequest, _sender, sendResponse) => {
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
  if (msg?.type === 'DISMISS_UPDATE_NOTICE') {
    handleDismissUpdateNotice().then(() => sendResponse(undefined));
    return true;
  }
  return false;
});
