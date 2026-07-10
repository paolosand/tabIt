import type { GetChartRequest } from '../messages';
import { handleGetChart } from './handler';

console.log('[tabit] background alive');

chrome.runtime.onMessage.addListener((msg: GetChartRequest, _sender, sendResponse) => {
  if (msg?.type === 'GET_CHART') {
    handleGetChart(msg.videoId).then(sendResponse);
    return true; // async response
  }
  return false;
});
