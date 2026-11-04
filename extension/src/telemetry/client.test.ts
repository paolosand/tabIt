import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock('./config');
  vi.resetModules();
});

async function load() {
  return await import('./client');
}

describe('insertRow', () => {
  it('POSTs the row with return=minimal and resolves true on 201', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
    const { insertRow } = await load();
    const row = { video_id: 'abc', n: 1 };
    await expect(insertRow('analyses', row)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://test.supabase.co/rest/v1/analyses');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      apikey: 'test-anon',
      Authorization: 'Bearer test-anon',
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    });
    expect(init.body).toBe(JSON.stringify(row));
  });

  it('sends a plain return=minimal insert with no query string even when duplicates are ok', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
    const { insertRow } = await load();
    await expect(insertRow('charts', { video_id: 'v' }, { duplicateOk: true })).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://test.supabase.co/rest/v1/charts');
    expect(init.headers.Prefer).toBe('return=minimal');
  });

  const dup = () =>
    new Response(JSON.stringify({ code: '23505', message: 'duplicate key value' }), { status: 409 });

  it('treats 409/23505 as success when duplicates are ok', async () => {
    fetchMock.mockResolvedValue(dup());
    const { insertRow } = await load();
    await expect(insertRow('charts', {}, { duplicateOk: true })).resolves.toBe(true);
  });

  it('treats 409/23505 as failure when duplicates are not ok', async () => {
    fetchMock.mockResolvedValue(dup());
    const { insertRow } = await load();
    await expect(insertRow('reports', {})).resolves.toBe(false);
  });

  it('treats a 409 with a different code as failure', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: '23503' }), { status: 409 }));
    const { insertRow } = await load();
    await expect(insertRow('charts', {}, { duplicateOk: true })).resolves.toBe(false);
  });

  it('treats a 401 as failure even when duplicates are ok', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: '42501' }), { status: 401 }));
    const { insertRow } = await load();
    await expect(insertRow('charts', {}, { duplicateOk: true })).resolves.toBe(false);
  });

  it('treats a 409 with an unparseable body as failure', async () => {
    fetchMock.mockResolvedValue(new Response('<html>not json', { status: 409 }));
    const { insertRow } = await load();
    await expect(insertRow('charts', {}, { duplicateOk: true })).resolves.toBe(false);
  });

  it('resolves false when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { insertRow } = await load();
    await expect(insertRow('reports', {})).resolves.toBe(false);
  });

  it.each([400, 401, 500])('resolves false on a %i response', async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    const { insertRow } = await load();
    await expect(insertRow('reports', {})).resolves.toBe(false);
  });

  it('aborts and resolves false after 5000 ms', async () => {
    vi.useFakeTimers();
    try {
      const ctrl = new AbortController();
      const spy = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
        setTimeout(() => ctrl.abort(new Error('timeout')), ms);
        return ctrl.signal;
      });
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_res, rej) => {
            init.signal!.addEventListener('abort', () => rej(init.signal!.reason));
          }),
      );
      const { insertRow } = await load();
      const p = insertRow('analyses', {});
      await vi.advanceTimersByTimeAsync(5000);
      await expect(p).resolves.toBe(false);
      expect(spy).toHaveBeenCalledWith(5000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves false without calling fetch when SUPABASE_URL is empty', async () => {
    vi.resetModules();
    vi.doMock('./config', () => ({ SUPABASE_URL: '', SUPABASE_ANON_KEY: '' }));
    const { insertRow } = await load();
    await expect(insertRow('analyses', {})).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
