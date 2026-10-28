import type { GetChartRequest, GetHelperStatusRequest, HelperStatusResponse } from '../messages';
import { handleGetChart, handleGetHelperStatus } from './handler';

console.log('[tabit] background alive');

chrome.runtime.onMessage.addListener((msg: GetChartRequest | GetHelperStatusRequest, _sender, sendResponse) => {
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
  return false;
});
