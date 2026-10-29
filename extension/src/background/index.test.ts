import { vi } from 'vitest';

vi.mock('./handler', () => ({
  handleGetChart: vi.fn(),
  handleGetHelperStatus: vi.fn(),
}));

test('GET_HELPER_STATUS always gets a reply, even if the handler rejects', async () => {
  const add = vi.spyOn(chrome.runtime.onMessage, 'addListener');
  const { handleGetHelperStatus } = await import('./handler');
  (handleGetHelperStatus as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
  await import('./index');
  const listener = add.mock.calls[0][0] as (m: unknown, s: unknown, r: (x: unknown) => void) => boolean;
  const reply = vi.fn();
  expect(listener({ type: 'GET_HELPER_STATUS' }, {}, reply)).toBe(true);
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ state: 'down', everSeen: false }));
});
