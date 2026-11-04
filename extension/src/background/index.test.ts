import { vi } from 'vitest';

vi.mock('./handler', () => ({
  handleGetChart: vi.fn(),
  handleGetHelperStatus: vi.fn(),
  handleReport: vi.fn(),
  handleReportDetails: vi.fn(),
  handleGetSharing: vi.fn(),
  handleSetSharing: vi.fn(),
  handleDismissUpdateNotice: vi.fn().mockResolvedValue(undefined),
}));

const OWN = { id: 'test-extension-id' };

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
  expect(listener({ type: 'GET_HELPER_STATUS' }, OWN, reply)).toBe(true);
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
  expect(listener(msg, OWN, reply)).toBe(true);
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(out));
  if (name === 'handleSetSharing') expect(handlers[name]).toHaveBeenCalledWith(true);
  else expect(handlers[name]).toHaveBeenCalled();
});

type Fn = ReturnType<typeof vi.fn>;
async function setup() {
  const listener = await loadListener();
  const h = (await import('./handler')) as unknown as Record<string, Fn>;
  for (const f of Object.values(h)) f.mockReset();
  return { listener, h };
}

test('messages from another sender are ignored', async () => {
  const { listener, h } = await setup();
  const reply = vi.fn();
  expect(listener({ type: 'SET_SHARING', shareUsage: true }, { id: 'someone-else' }, reply)).toBe(false);
  expect(h.handleSetSharing).not.toHaveBeenCalled();
  expect(reply).not.toHaveBeenCalled();
});

test.each([['yes'], [1], [undefined], [null]])('SET_SHARING with non-boolean %j replies the stored value and does not write', async (bad) => {
  const { listener, h } = await setup();
  h.handleGetSharing.mockResolvedValue({ shareUsage: true });
  const reply = vi.fn();
  expect(listener({ type: 'SET_SHARING', shareUsage: bad }, OWN, reply)).toBe(true);
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ shareUsage: true }));
  expect(h.handleSetSharing).not.toHaveBeenCalled();
});

test('a failed SET_SHARING re-reads storage and replies the actual value', async () => {
  const { listener, h } = await setup();
  h.handleSetSharing.mockRejectedValue(new Error('write failed'));
  h.handleGetSharing.mockResolvedValue({ shareUsage: true });
  const reply = vi.fn();
  listener({ type: 'SET_SHARING', shareUsage: false }, OWN, reply);
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ shareUsage: true }));
});

test('when the re-read also fails, SET_SHARING replies an explicit error shape, never shareUsage:false', async () => {
  const { listener, h } = await setup();
  h.handleSetSharing.mockRejectedValue(new Error('write failed'));
  h.handleGetSharing.mockRejectedValue(new Error('read failed'));
  const reply = vi.fn();
  listener({ type: 'SET_SHARING', shareUsage: false }, OWN, reply);
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ error: 'unavailable' }));
});

test('GET_SHARING failure replies the explicit error shape', async () => {
  const { listener, h } = await setup();
  h.handleGetSharing.mockRejectedValue(new Error('read failed'));
  const reply = vi.fn();
  listener({ type: 'GET_SHARING' }, OWN, reply);
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ error: 'unavailable' }));
});

test.each([
  [{ type: 'REPORT_BAD_TRANSCRIPTION', chart: {}, reportId: 5 }],
  [{ type: 'REPORT_BAD_TRANSCRIPTION', chart: null, reportId: 'r1' }],
  [{ type: 'REPORT_DETAILS', reportId: 5, reason: 'key', note: 'n' }],
  [{ type: 'REPORT_DETAILS', reportId: 'r1', reason: 'bogus', note: 'n' }],
  [{ type: 'REPORT_DETAILS', reportId: 'r1', reason: 'key', note: 7 }],
])('malformed report payload %j replies ok:false without calling the handler', async (msg) => {
  const { listener, h } = await setup();
  const reply = vi.fn();
  expect(listener(msg, OWN, reply)).toBe(true);
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ ok: false }));
  expect(h.handleReport).not.toHaveBeenCalled();
  expect(h.handleReportDetails).not.toHaveBeenCalled();
});

test('REPORT_DETAILS caps the note at 500 characters', async () => {
  const { listener, h } = await setup();
  h.handleReportDetails.mockResolvedValue({ ok: true });
  const reply = vi.fn();
  listener({ type: 'REPORT_DETAILS', reportId: 'r1', reason: 'other', note: 'x'.repeat(900) }, OWN, reply);
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ ok: true }));
  expect(h.handleReportDetails).toHaveBeenCalledWith({ type: 'REPORT_DETAILS', reportId: 'r1', reason: 'other', note: 'x'.repeat(500) });
});

test('DISMISS_UPDATE_NOTICE is handled and acknowledged', async () => {
  const { listener, h } = await setup();
  h.handleDismissUpdateNotice.mockResolvedValue(undefined);
  const reply = vi.fn();
  expect(listener({ type: 'DISMISS_UPDATE_NOTICE' }, OWN, reply)).toBe(true);
  await vi.waitFor(() => expect(reply).toHaveBeenCalled());
  expect(h.handleDismissUpdateNotice).toHaveBeenCalled();
});
