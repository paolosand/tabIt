import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chart } from '../../../web/src/lib/types';

vi.mock('./client', () => ({ insertRow: vi.fn() }));
vi.mock('./settings', () => ({
  getShareUsage: vi.fn(),
  getInstallId: vi.fn(),
}));

import { insertRow } from './client';
import { getInstallId, getShareUsage } from './settings';
import { recordAnalysis, recordFailure, submitReport, submitReportDetails } from './record';

const chart = {
  source: { kind: 'youtube', videoId: 'abc12345678', title: 'Song', duration: 100 },
  analysis: { engineVersion: '0.4.1', createdAt: 'x' },
} as unknown as Chart;
const noVideo = { ...chart, source: { kind: 'file', duration: 1 } } as unknown as Chart;

const ins = vi.mocked(insertRow);

beforeEach(() => {
  vi.resetAllMocks();
  ins.mockResolvedValue(true);
  vi.mocked(getInstallId).mockResolvedValue('install-1');
  vi.mocked(getShareUsage).mockResolvedValue(true);
});

describe('sharing off', () => {
  beforeEach(() => {
    vi.mocked(getShareUsage).mockResolvedValue(false);
  });

  it('recordAnalysis and recordFailure insert nothing', async () => {
    await recordAnalysis(chart);
    await recordFailure('abc12345678', 'boom', '0.4.1');
    expect(ins).not.toHaveBeenCalled();
  });

  it('submitReport still inserts chart then report', async () => {
    expect(await submitReport(chart, 'rid')).toBe(true);
    expect(ins.mock.calls.map((c) => c[0])).toEqual(['charts', 'reports']);
    expect(ins.mock.calls[1][1]).toEqual({
      id: 'rid',
      install_id: 'install-1',
      video_id: 'abc12345678',
      engine_version: '0.4.1',
    });
  });
});

describe('sharing on', () => {
  it('recordAnalysis inserts chart (ignoreDuplicates) then analysis', async () => {
    await recordAnalysis(chart);
    expect(ins.mock.calls[0]).toEqual([
      'charts',
      { video_id: 'abc12345678', engine_version: '0.4.1', title: 'Song', chart },
      { ignoreDuplicates: true },
    ]);
    expect(ins.mock.calls[1][0]).toBe('analyses');
    expect(ins.mock.calls[1][1]).toMatchObject({
      install_id: 'install-1',
      video_id: 'abc12345678',
      engine_version: '0.4.1',
      outcome: 'ok',
    });
    expect(ins.mock.calls[1][1]).not.toHaveProperty('id');
  });

  it('recordAnalysis skips everything without a videoId', async () => {
    await recordAnalysis(noVideo);
    expect(ins).not.toHaveBeenCalled();
  });

  it('recordFailure inserts a scrubbed failed row', async () => {
    await recordFailure('abc12345678', 'HTTP Error 403 at /Users/me/x', '0.4.1');
    expect(ins).toHaveBeenCalledTimes(1);
    expect(ins.mock.calls[0][0]).toBe('analyses');
    expect(ins.mock.calls[0][1]).toMatchObject({
      outcome: 'failed',
      error_category: 'download_failed',
      error_message: 'HTTP Error 403 at /Users/<user>/x',
      engine_version: '0.4.1',
      video_id: 'abc12345678',
    });
    expect(ins.mock.calls[0][1]).not.toHaveProperty('id');
  });

  it('recordFailure allows a null engine version', async () => {
    await recordFailure('abc12345678', 'boom', null);
    expect(ins.mock.calls[0][1]).toMatchObject({ engine_version: null });
  });
});

describe('submitReport', () => {
  it('returns false when the report insert fails', async () => {
    ins.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await submitReport(chart, 'rid')).toBe(false);
  });

  it('returns false without a videoId and records nothing', async () => {
    expect(await submitReport(noVideo, 'rid')).toBe(false);
    expect(ins).not.toHaveBeenCalled();
  });
});

describe('submitReportDetails', () => {
  it('stores an empty note as null', async () => {
    expect(await submitReportDetails('rid', 'key', '')).toBe(true);
    expect(ins).toHaveBeenCalledWith('report_details', {
      report_id: 'rid',
      reason: 'key',
      note: null,
    });
  });

  it('keeps a non-empty note', async () => {
    await submitReportDetails('rid', 'other', 'hi');
    expect(ins.mock.calls[0][1]).toMatchObject({ note: 'hi' });
  });
});

describe('never rejects', () => {
  it('when insertRow returns false', async () => {
    ins.mockResolvedValue(false);
    await expect(recordAnalysis(chart)).resolves.toBeUndefined();
    await expect(recordFailure('a', 'b', null)).resolves.toBeUndefined();
    await expect(submitReport(chart, 'r')).resolves.toBe(false);
    await expect(submitReportDetails('r', 'tempo', 'n')).resolves.toBe(false);
  });

  it('when getInstallId rejects', async () => {
    vi.mocked(getInstallId).mockRejectedValue(new Error('storage'));
    await expect(recordAnalysis(chart)).resolves.toBeUndefined();
    await expect(recordFailure('a', 'b', null)).resolves.toBeUndefined();
    await expect(submitReport(chart, 'r')).resolves.toBe(false);
  });

  it('when getShareUsage rejects', async () => {
    vi.mocked(getShareUsage).mockRejectedValue(new Error('storage'));
    await expect(recordAnalysis(chart)).resolves.toBeUndefined();
    await expect(recordFailure('a', 'b', null)).resolves.toBeUndefined();
  });

  it('when insertRow rejects', async () => {
    ins.mockRejectedValue(new Error('x'));
    await expect(recordAnalysis(chart)).resolves.toBeUndefined();
    await expect(submitReport(chart, 'r')).resolves.toBe(false);
    await expect(submitReportDetails('r', 'tempo', '')).resolves.toBe(false);
  });
});
