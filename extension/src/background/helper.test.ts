import { vi } from 'vitest';
import { getHelperStatus } from './helper';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('a /health call that never answers is aborted after 3s and counts as down', async () => {
  const ctrl = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(ctrl.signal);
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError')));
      }),
    ),
  );
  const pending = getHelperStatus();
  ctrl.abort();
  expect(await pending).toEqual({ state: 'down' });
  expect(timeout).toHaveBeenCalledWith(3000);
});

function stubHealth(res: { ok?: boolean; json: () => Promise<unknown> }) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, ...res }));
}

test('a genuine tabIt /health answer is up', async () => {
  stubHealth({ json: async () => ({ status: 'ok', engineVersion: '0.4.1' }) });
  expect(await getHelperStatus()).toEqual({ state: 'up', engineVersion: '0.4.1' });
});

test('a 200 that is not JSON counts as down', async () => {
  stubHealth({ json: async () => { throw new SyntaxError('Unexpected token <'); } });
  expect(await getHelperStatus()).toEqual({ state: 'down' });
});

test('a JSON answer whose status is not "ok" counts as down', async () => {
  stubHealth({ json: async () => ({ status: 'starting', engineVersion: '0.4.1' }) });
  expect(await getHelperStatus()).toEqual({ state: 'down' });
});

test('an answer without a string engineVersion counts as down', async () => {
  stubHealth({ json: async () => ({ status: 'ok' }) });
  expect(await getHelperStatus()).toEqual({ state: 'down' });
});
