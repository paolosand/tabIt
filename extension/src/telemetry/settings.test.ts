import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getInstallId, getShareUsage, setShareUsage } from './settings';

type Local = { _data: Record<string, unknown>; get: unknown };
const local = () => (chrome.storage.local as unknown as Local);

describe('telemetry settings', () => {
  beforeEach(() => {
    local()._data = {};
    vi.restoreAllMocks();
  });

  it('defaults sharing to off', async () => {
    expect(await getShareUsage()).toBe(false);
  });

  it('persists the sharing choice', async () => {
    await setShareUsage(true);
    expect(await getShareUsage()).toBe(true);
    await setShareUsage(false);
    expect(await getShareUsage()).toBe(false);
  });

  it('returns false when storage throws', async () => {
    const original = local().get;
    local().get = () => Promise.reject(new Error('boom'));
    try {
      expect(await getShareUsage()).toBe(false);
    } finally {
      local().get = original;
    }
  });

  it('creates the install id lazily and keeps it stable', async () => {
    expect(local()._data.installId).toBeUndefined();
    const a = await getInstallId();
    const b = await getInstallId();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(b).toBe(a);
    expect(local()._data.installId).toBe(a);
  });
});
