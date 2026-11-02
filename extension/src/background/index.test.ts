import { vi } from 'vitest';

vi.mock('./handler', () => ({
  handleGetChart: vi.fn(),
  handleGetHelperStatus: vi.fn(),
  handleReport: vi.fn(),
  handleReportDetails: vi.fn(),
  handleGetSharing: vi.fn(),
  handleSetSharing: vi.fn(),
}));

type Listener = (m: unknown, s: unknown, r: (x: unknown) => void) => boolean;

async function loadListener(): Promise<Listener> {
  vi.resetModules();
  const add = vi.spyOn(chrome.runtime.onMessage, 'addListener');
  await import('./index');
  return add.mock.calls[0][0] as Listener;
}

test('GET_HELPER_STATUS always gets a reply, even if the handler rejects', async () => {
  const listener = await loadListener();
  const { handleGetHelperStatus } = await import('./handler');
  (handleGetHelperStatus as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
  const reply = vi.fn();
  expect(listener({ type: 'GET_HELPER_STATUS' }, {}, reply)).toBe(true);
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ state: 'down', everSeen: false }));
});

test.each([
  ['REPORT_BAD_TRANSCRIPTION', 'handleReport', { type: 'REPORT_BAD_TRANSCRIPTION', chart: {}, reportId: 'r1' }, { ok: true }],
  ['REPORT_DETAILS', 'handleReportDetails', { type: 'REPORT_DETAILS', reportId: 'r1', reason: 'key', note: 'n' }, { ok: true }],
  ['GET_SHARING', 'handleGetSharing', { type: 'GET_SHARING' }, { shareUsage: false }],
  ['SET_SHARING', 'handleSetSharing', { type: 'SET_SHARING', shareUsage: true }, { shareUsage: true }],
])('%s is routed to %s and replies', async (_t, name, msg, out) => {
  const listener = await loadListener();
  const handlers = (await import('./handler')) as unknown as Record<string, ReturnType<typeof vi.fn>>;
  handlers[name].mockResolvedValue(out);
  const reply = vi.fn();
  expect(listener(msg, {}, reply)).toBe(true);
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(out));
  if (name === 'handleSetSharing') expect(handlers[name]).toHaveBeenCalledWith(true);
  else expect(handlers[name]).toHaveBeenCalled();
});
