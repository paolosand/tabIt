import { vi, type Mock } from 'vitest';
import { handleGetChart, handleGetHelperStatus, handleGetSharing, handleSetSharing } from './handler';
import * as record from '../telemetry/record';
import * as api from './api';

vi.mock('./api', () => ({
  API_BASE: 'http://localhost:28224',
  fetchCachedChart: vi.fn(),
  submitAnalysis: vi.fn(),
  pollJobOnce: vi.fn(),
}));

vi.mock('../telemetry/record', () => ({
  recordAnalysis: vi.fn(),
  recordFailure: vi.fn(),
  submitReport: vi.fn(),
  submitReportDetails: vi.fn(),
}));

const CHART = { schemaVersion: 1 } as never;

beforeEach(async () => {
  vi.clearAllMocks();
  // reset the session stub between tests
  (chrome.storage.session as unknown as { _data: Record<string, unknown> })._data = {};
  (chrome.storage.local as unknown as { _data: Record<string, unknown> })._data = {};
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

test('helper unreachable (network-level TypeError) -> offline, not error', async () => {
  (api.fetchCachedChart as Mock).mockRejectedValue(new TypeError('Failed to fetch'));
  const res = await handleGetChart('vid00000001');
  expect(res).toEqual({ status: 'offline' });
});

test('helper dying mid-job -> offline, and the job key clears so recovery resubmits', async () => {
  await chrome.storage.session.set({ 'job:vid00000001': 'job-1' });
  (api.pollJobOnce as Mock).mockRejectedValue(new TypeError('Failed to fetch'));
  const res = await handleGetChart('vid00000001');
  expect(res).toEqual({ status: 'offline' });
  const stored = await chrome.storage.session.get('job:vid00000001');
  expect(stored['job:vid00000001']).toBeUndefined();
});

test('HTTP error from a live server stays error, not offline', async () => {
  (api.fetchCachedChart as Mock).mockRejectedValue(new Error('API 500'));
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

test('pending job passes the pipeline step through', async () => {
  await chrome.storage.session.set({ 'job:vid00000001': 'job-1' });
  (api.pollJobOnce as Mock).mockResolvedValue({ status: 'pending', step: 'chords' });
  const res = await handleGetChart('vid00000001');
  expect(res).toEqual({ status: 'pending', step: 'chords' });
});

describe('handleGetHelperStatus', () => {
  const okJson = (body: unknown, status = 200) =>
    vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  test('healthy current helper -> up, remembers it was seen', async () => {
    const f = okJson({ status: 'ok', engineVersion: '0.4.0' });
    vi.stubGlobal('fetch', f);
    expect(await handleGetHelperStatus()).toEqual({ state: 'up', tooOld: false });
    expect(f).toHaveBeenCalledWith('http://localhost:28224/health', expect.objectContaining({ signal: expect.anything() }));
    expect((await chrome.storage.local.get('helperSeen')).helperSeen).toBe(true);
  });

  test('older helper -> up with tooOld', async () => {
    vi.stubGlobal('fetch', okJson({ status: 'ok', engineVersion: '0.3.1' }));
    expect(await handleGetHelperStatus()).toEqual({ state: 'up', tooOld: true });
  });

  test('network failure, never seen -> down, everSeen false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await handleGetHelperStatus()).toEqual({ state: 'down', everSeen: false });
  });

  test('network failure after helperSeen -> everSeen true', async () => {
    await chrome.storage.local.set({ helperSeen: true });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await handleGetHelperStatus()).toEqual({ state: 'down', everSeen: true });
  });

  test('200 without engineVersion (other program on the port) -> down', async () => {
    vi.stubGlobal('fetch', okJson({ hello: 'world' }));
    expect(await handleGetHelperStatus()).toEqual({ state: 'down', everSeen: false });
    expect((await chrome.storage.local.get('helperSeen')).helperSeen).toBeUndefined();
  });

  test('500 -> down', async () => {
    vi.stubGlobal('fetch', okJson({}, 500));
    expect(await handleGetHelperStatus()).toEqual({ state: 'down', everSeen: false });
  });

  test('a failing storage read falls back to everSeen false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    vi.spyOn(chrome.storage.local, 'get').mockRejectedValue(new Error('storage broken'));
    expect(await handleGetHelperStatus()).toEqual({ state: 'down', everSeen: false });
  });

  test('a failing storage write does not discard a confirmed up result', async () => {
    vi.stubGlobal('fetch', okJson({ status: 'ok', engineVersion: '0.4.0' }));
    vi.spyOn(chrome.storage.local, 'set').mockRejectedValue(new Error('quota'));
    expect(await handleGetHelperStatus()).toEqual({ state: 'up', tooOld: false });
  });
});

describe('usage recording', () => {
  const healthUp = () => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => ({ status: 'ok', engineVersion: '0.4.0' }),
  }));
  const healthDown = () => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  afterEach(() => { vi.unstubAllGlobals(); });

  test('job done records the analysis once and still returns the chart', async () => {
    await chrome.storage.session.set({ 'job:vid00000001': 'job-1' });
    (api.pollJobOnce as Mock).mockResolvedValue({ status: 'done', chart: CHART });
    const res = await handleGetChart('vid00000001');
    expect(res).toEqual({ status: 'done', chart: CHART });
    expect(record.recordAnalysis).toHaveBeenCalledTimes(1);
    expect(record.recordAnalysis).toHaveBeenCalledWith(CHART);
  });

  test('server cache hit records once; the session-cache hit afterwards does not', async () => {
    (api.fetchCachedChart as Mock).mockResolvedValue(CHART);
    await handleGetChart('vid00000001');
    await handleGetChart('vid00000001');
    expect(record.recordAnalysis).toHaveBeenCalledTimes(1);
  });

  test('job error records a failure with the engine version', async () => {
    healthUp();
    await chrome.storage.session.set({ 'job:vid00000001': 'job-1' });
    (api.pollJobOnce as Mock).mockResolvedValue({ status: 'error', error: 'HTTP Error 403' });
    const res = await handleGetChart('vid00000001');
    expect(res).toEqual({ status: 'error', error: 'HTTP Error 403' });
    await vi.waitFor(() => expect(record.recordFailure).toHaveBeenCalledWith('vid00000001', 'HTTP Error 403', '0.4.0'));
    expect(record.recordFailure).toHaveBeenCalledTimes(1);
  });

  test('job error with the helper down records a null engine version', async () => {
    healthDown();
    await chrome.storage.session.set({ 'job:vid00000001': 'job-1' });
    (api.pollJobOnce as Mock).mockResolvedValue({ status: 'error', error: 'boom' });
    await handleGetChart('vid00000001');
    await vi.waitFor(() => expect(record.recordFailure).toHaveBeenCalledWith('vid00000001', 'boom', null));
  });

  test('a non-TypeError exception records a failure', async () => {
    healthDown();
    (api.fetchCachedChart as Mock).mockRejectedValue(new Error('API 500'));
    const res = await handleGetChart('vid00000001');
    expect(res).toEqual({ status: 'error', error: 'API 500' });
    await vi.waitFor(() => expect(record.recordFailure).toHaveBeenCalledWith('vid00000001', 'API 500', null));
  });

  test('a TypeError (offline) records nothing', async () => {
    healthDown();
    (api.fetchCachedChart as Mock).mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await handleGetChart('vid00000001')).toEqual({ status: 'offline' });
    await new Promise((r) => setTimeout(r, 10));
    expect(record.recordAnalysis).not.toHaveBeenCalled();
    expect(record.recordFailure).not.toHaveBeenCalled();
  });

  test('recording that rejects or never resolves does not affect the response', async () => {
    (api.fetchCachedChart as Mock).mockResolvedValue(CHART);
    (record.recordAnalysis as Mock).mockRejectedValueOnce(new Error('nope'));
    expect(await handleGetChart('vid00000001')).toEqual({ status: 'done', chart: CHART });
    (chrome.storage.session as unknown as { _data: Record<string, unknown> })._data = {};
    (record.recordAnalysis as Mock).mockReturnValueOnce(new Promise(() => {}));
    expect(await handleGetChart('vid00000001')).toEqual({ status: 'done', chart: CHART });
  });
});

test('setSharing(true) persists and getSharing reports it', async () => {
  expect(await handleGetSharing()).toEqual({ shareUsage: false });
  expect(await handleSetSharing(true)).toEqual({ shareUsage: true });
  expect(await handleGetSharing()).toEqual({ shareUsage: true });
});
