import { vi, type Mock } from 'vitest';
import { handleGetChart } from './handler';
import * as api from './api';

vi.mock('./api', () => ({
  fetchCachedChart: vi.fn(),
  submitAnalysis: vi.fn(),
  pollJobOnce: vi.fn(),
}));

const CHART = { schemaVersion: 1 } as never;

beforeEach(async () => {
  vi.clearAllMocks();
  // reset the session stub between tests
  (chrome.storage.session as unknown as { _data: Record<string, unknown> })._data = {};
});

test('session-cached chart returns done without network', async () => {
  await chrome.storage.session.set({ 'chart:vid00000001': CHART });
  const res = await handleGetChart('vid00000001');
  expect(res).toEqual({ status: 'done', chart: CHART });
  expect(api.fetchCachedChart).not.toHaveBeenCalled();
});

test('server cache hit stores and returns done', async () => {
  (api.fetchCachedChart as Mock).mockResolvedValue(CHART);
  const res = await handleGetChart('vid00000001');
  expect(res.status).toBe('done');
  const stored = await chrome.storage.session.get('chart:vid00000001');
  expect(stored['chart:vid00000001']).toEqual(CHART);
});

test('cache miss submits a job and reports pending', async () => {
  (api.fetchCachedChart as Mock).mockResolvedValue(null);
  (api.submitAnalysis as Mock).mockResolvedValue('job-1');
  const res = await handleGetChart('vid00000001');
  expect(res).toEqual({ status: 'pending' });
  const stored = await chrome.storage.session.get('job:vid00000001');
  expect(stored['job:vid00000001']).toBe('job-1');
});

test('existing job is polled once; done resolves and clears the job', async () => {
  await chrome.storage.session.set({ 'job:vid00000001': 'job-1' });
  (api.pollJobOnce as Mock).mockResolvedValue({ status: 'done', chart: CHART });
  const res = await handleGetChart('vid00000001');
  expect(res.status).toBe('done');
  expect(api.submitAnalysis).not.toHaveBeenCalled();
});

test('job error surfaces and clears the job for retry', async () => {
  await chrome.storage.session.set({ 'job:vid00000001': 'job-1' });
  (api.pollJobOnce as Mock).mockResolvedValue({ status: 'error', error: 'boom' });
  const res = await handleGetChart('vid00000001');
  expect(res).toEqual({ status: 'error', error: 'boom' });
  const stored = await chrome.storage.session.get('job:vid00000001');
  expect(stored['job:vid00000001']).toBeUndefined();
});

test('API unreachable -> error response, not a throw', async () => {
  (api.fetchCachedChart as Mock).mockRejectedValue(new TypeError('fetch failed'));
  const res = await handleGetChart('vid00000001');
  expect(res.status).toBe('error');
});

test('stale job: pollJobOnce throwing (e.g. API 404 after SW restart lost the in-memory JobStore) clears the job key so the next call resubmits instead of erroring forever', async () => {
  await chrome.storage.session.set({ 'job:vid00000001': 'job-1' });
  (api.pollJobOnce as Mock).mockRejectedValue(new Error('API 404'));

  const res = await handleGetChart('vid00000001');
  expect(res.status).toBe('error');
  const stored = await chrome.storage.session.get('job:vid00000001');
  expect(stored['job:vid00000001']).toBeUndefined();

  // Next call falls through the normal idempotent path: no stale job left to re-poll.
  (api.fetchCachedChart as Mock).mockResolvedValue(null);
  (api.submitAnalysis as Mock).mockResolvedValue('job-2');
  const res2 = await handleGetChart('vid00000001');
  expect(res2).toEqual({ status: 'pending' });
  expect(api.pollJobOnce).toHaveBeenCalledTimes(1);
  expect(api.submitAnalysis).toHaveBeenCalledWith('vid00000001');
});
