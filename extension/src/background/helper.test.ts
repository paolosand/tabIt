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
