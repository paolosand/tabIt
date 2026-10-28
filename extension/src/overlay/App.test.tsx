import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, type Mock } from 'vitest';
import { App } from './App';
import * as platform from '../platform';

vi.mock('../platform', () => ({ isMac: vi.fn(() => true) }));

const CHART = {
  schemaVersion: 1,
  source: { kind: 'youtube', videoId: 'vid00000001', title: 'T', duration: 10 },
  analysis: { engineVersion: '0.1.0', createdAt: 'now' },
  key: { tonic: 'A', mode: 'major', confidence: 0.9 },
  scales: [{ name: 'A major pentatonic', notes: [] }],
  tempo: { bpm: 120 }, beats: [], sections: [],
  chords: [{ start: 0, end: 5, label: 'A', root: 'A', quality: 'maj', bass: 'A', confidence: 0.9 }],
};

// The mount-time GET_HELPER_STATUS probe is answered 'up' by default; chart tests
// script GET_CHART responses through `send` and count only those calls.
const statusCalls = (send: Mock) => send.mock.calls.filter(([m]) => m.type === 'GET_HELPER_STATUS');
const chartCalls = (send: Mock) => send.mock.calls.filter(([m]) => m.type === 'GET_CHART');
let chartResponses: Mock;
let statusResponses: Mock;
beforeEach(() => {
  (platform.isMac as Mock).mockReturnValue(true);
  chartResponses = vi.fn();
  statusResponses = vi.fn().mockResolvedValue({ state: 'up', tooOld: false });
  (chrome.runtime as { sendMessage: unknown }).sendMessage = vi.fn((m: { type: string }) =>
    m.type === 'GET_HELPER_STATUS' ? statusResponses() : chartResponses(m),
  );
});

test('collapsed bar -> click -> done chart renders sheet', async () => {
  chartResponses.mockResolvedValue({ status: 'done', chart: CHART });
  render(<App videoId="vid00000001" />);
  await userEvent.click(screen.getByRole('button', { name: /get chords/i }));
  await waitFor(() => expect(screen.getByText(/A major pentatonic/)).toBeInTheDocument());
  // Confirms this is the real Panel (Task 5), not the old placeholder div: the
  // sole chord ('A') is current at t=0 and carries the marker highlight.
  expect(screen.getByTestId('marker').parentElement).toHaveTextContent('A');
});

test('error response shows retry', async () => {
  chartResponses.mockResolvedValue({ status: 'error', error: 'server unreachable' });
  render(<App videoId="vid00000001" />);
  await userEvent.click(screen.getByRole('button', { name: /get chords/i }));
  await waitFor(() => expect(screen.getByText(/server unreachable/)).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
});

test('pending keeps polling until done', async () => {
  vi.useFakeTimers();
  const send = chrome.runtime.sendMessage as Mock;
  chartResponses.mockResolvedValueOnce({ status: 'pending' }).mockResolvedValueOnce({ status: 'done', chart: CHART });
  render(<App videoId="vid00000001" />);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.click(screen.getByRole('button', { name: /get chords/i }));
  await vi.advanceTimersByTimeAsync(3100);
  await waitFor(() => expect(screen.getByText(/A major pentatonic/)).toBeInTheDocument());
  expect(chartCalls(send)).toHaveLength(2);
  vi.useRealTimers();
});

test('pending step from the background reaches the checklist', async () => {
  vi.useFakeTimers();
  chartResponses
    .mockResolvedValueOnce({ status: 'pending', step: 'chords' })
    .mockResolvedValueOnce({ status: 'done', chart: CHART });
  render(<App videoId="vid00000001" />);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.click(screen.getByRole('button', { name: /get chords/i }));

  await waitFor(() =>
    expect(screen.getByText('Find chords')).toHaveAttribute('aria-current', 'step'),
  );
  expect(screen.getByText('Fetch audio')).toHaveClass('tabit-check-done');

  await vi.advanceTimersByTimeAsync(3100);
  await waitFor(() => expect(screen.getByText(/A major pentatonic/)).toBeInTheDocument());
  vi.useRealTimers();
});

test('offline response shows the helper-offline bar, backs off, and auto-recovers', async () => {
  vi.useFakeTimers();
  const send = chrome.runtime.sendMessage as Mock;
  chartResponses
    .mockResolvedValueOnce({ status: 'offline' })
    .mockResolvedValueOnce({ status: 'offline' })
    .mockResolvedValueOnce({ status: 'done', chart: CHART });
  render(<App videoId="vid00000001" />);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.click(screen.getByRole('button', { name: /get chords/i }));

  await waitFor(() => expect(screen.getByText(/tabIt isn't running/)).toBeInTheDocument());

  // first retry fires at the 3s base delay…
  await vi.advanceTimersByTimeAsync(3100);
  expect(chartCalls(send)).toHaveLength(2);

  // …the second backs off to 6s: nothing at +3s…
  await vi.advanceTimersByTimeAsync(3100);
  expect(chartCalls(send)).toHaveLength(2);

  // …but fires by +6s, and the recovered helper's chart renders
  await vi.advanceTimersByTimeAsync(3000);
  await waitFor(() => expect(screen.getByText(/A major pentatonic/)).toBeInTheDocument());
  expect(chartCalls(send)).toHaveLength(3);
  vi.useRealTimers();
});

test('manual retry from the offline bar polls immediately', async () => {
  chartResponses
    .mockResolvedValueOnce({ status: 'offline' })
    .mockResolvedValueOnce({ status: 'done', chart: CHART });
  render(<App videoId="vid00000001" />);
  await userEvent.click(screen.getByRole('button', { name: /get chords/i }));
  await waitFor(() => expect(screen.getByText(/tabIt isn't running/)).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /retry/i }));
  await waitFor(() => expect(screen.getByText(/A major pentatonic/)).toBeInTheDocument());
});

describe('first-run states', () => {
  const INSTALL = /curl -fsSL/;
  const realClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  afterEach(() => {
    if (realClipboard) Object.defineProperty(navigator, 'clipboard', realClipboard);
    else delete (navigator as unknown as { clipboard?: unknown }).clipboard;
  });

  test('helper down and never seen shows the setup bar on mount, no click needed', async () => {
    statusResponses.mockResolvedValue({ state: 'down', everSeen: false });
    render(<App videoId="vid00000001" />);
    expect(await screen.findByText(INSTALL)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy command' })).toBeInTheDocument();
    expect(screen.queryByText('Set up tabIt on this Mac')).toBeInTheDocument();
  });

  test('setup polls and flips to "Helper connected" once the helper is up', async () => {
    vi.useFakeTimers();
    statusResponses
      .mockResolvedValueOnce({ state: 'down', everSeen: false })
      .mockResolvedValueOnce({ state: 'down', everSeen: false })
      .mockResolvedValue({ state: 'up', tooOld: false });
    render(<App videoId="vid00000001" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText(INSTALL)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); }); // backoff 3s
    expect(statusCalls(chrome.runtime.sendMessage as Mock)).toHaveLength(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(6100); }); // backoff 6s
    expect(screen.getByText('Helper connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /get chords/i })).toBeInTheDocument();
    expect(screen.queryByText(INSTALL)).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  test('helper up and current stays a plain collapsed bar', async () => {
    render(<App videoId="vid00000001" />);
    await waitFor(() => expect(statusResponses).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /get chords/i })).toBeInTheDocument();
    expect(screen.queryByText('Helper connected')).not.toBeInTheDocument();
  });

  test('helper up but too old shows setup in update mode', async () => {
    statusResponses.mockResolvedValue({ state: 'up', tooOld: true });
    render(<App videoId="vid00000001" />);
    expect(await screen.findByText('tabIt needs a quick update')).toBeInTheDocument();
    expect(screen.getByText(INSTALL)).toBeInTheDocument();
  });

  test('helper down but seen before stays collapsed, then shows the offline bar on Get chords', async () => {
    statusResponses.mockResolvedValue({ state: 'down', everSeen: true });
    chartResponses.mockResolvedValue({ status: 'offline' });
    render(<App videoId="vid00000001" />);
    await waitFor(() => expect(statusResponses).toHaveBeenCalled());
    expect(screen.queryByText(INSTALL)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /get chords/i }));
    expect(await screen.findByText(/tabIt isn't running/)).toBeInTheDocument();
    expect(screen.getByText('tabit restart')).toBeInTheDocument();
  });

  test('a helper that dies during an update poll returns to a plain collapsed bar', async () => {
    vi.useFakeTimers();
    statusResponses
      .mockResolvedValueOnce({ state: 'up', tooOld: true })
      .mockResolvedValue({ state: 'down', everSeen: true });
    render(<App videoId="vid00000001" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('tabIt needs a quick update')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(screen.getByRole('button', { name: /get chords/i })).toBeInTheDocument();
    expect(screen.queryByText('Helper connected')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  test('update mode flips to "Helper connected" once the helper is current', async () => {
    vi.useFakeTimers();
    statusResponses
      .mockResolvedValueOnce({ state: 'up', tooOld: true })
      .mockResolvedValue({ state: 'up', tooOld: false });
    render(<App videoId="vid00000001" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('tabIt needs a quick update')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(screen.getByText('Helper connected')).toBeInTheDocument();
    vi.useRealTimers();
  });

  test('status polling stops after "Helper connected"', async () => {
    vi.useFakeTimers();
    statusResponses
      .mockResolvedValueOnce({ state: 'down', everSeen: false })
      .mockResolvedValue({ state: 'up', tooOld: false });
    render(<App videoId="vid00000001" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(screen.getByText('Helper connected')).toBeInTheDocument();
    const send = chrome.runtime.sendMessage as Mock;
    const n = statusCalls(send).length;
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    expect(statusCalls(send)).toHaveLength(n);
    vi.useRealTimers();
  });

  test('Get chords clicked while the status probe is in flight is not clobbered by its answer', async () => {
    let resolve!: (v: unknown) => void;
    statusResponses.mockReturnValue(new Promise((r) => { resolve = r; }));
    chartResponses.mockReturnValue(new Promise(() => {})); // chart stays pending
    render(<App videoId="vid00000001" />);
    await userEvent.click(screen.getByRole('button', { name: /get chords/i }));
    expect(screen.getByText('Fetch audio')).toBeInTheDocument();
    await act(async () => { resolve({ state: 'down', everSeen: false }); });
    expect(screen.queryByText(INSTALL)).not.toBeInTheDocument();
    expect(screen.getByText('Fetch audio')).toBeInTheDocument();
  });

  test('not a Mac shows the unsupported bar and sends no status message', async () => {
    (platform.isMac as Mock).mockReturnValue(false);
    render(<App videoId="vid00000001" />);
    // first render, before any effect/microtask: never offers Get chords
    expect(screen.queryByRole('button', { name: /get chords/i })).not.toBeInTheDocument();
    expect(screen.getByText('tabIt needs a Mac for now')).toBeInTheDocument();
    expect(statusCalls(chrome.runtime.sendMessage as Mock)).toHaveLength(0);
  });

  test('unmounting during setup leaves no later sendMessage and no state update', async () => {
    vi.useFakeTimers();
    statusResponses.mockResolvedValue({ state: 'down', everSeen: false });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<App videoId="vid00000001" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const send = chrome.runtime.sendMessage as Mock;
    const before = send.mock.calls.length;
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    expect(send.mock.calls.length).toBe(before);
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
    vi.useRealTimers();
  });

  test('a status response that lands after unmount is ignored', async () => {
    let resolve!: (v: unknown) => void;
    statusResponses.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { unmount } = render(<App videoId="vid00000001" />);
    unmount();
    resolve({ state: 'down', everSeen: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(chartCalls(chrome.runtime.sendMessage as Mock)).toHaveLength(0);
    expect(statusCalls(chrome.runtime.sendMessage as Mock)).toHaveLength(1);
  });

  test('Copy writes the install command to the clipboard and shows Copied', async () => {
    statusResponses.mockResolvedValue({ state: 'down', everSeen: false });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<App videoId="vid00000001" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Copy command' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^curl -fsSL .*install\.sh \| sh$/));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  test('a rejected clipboard write resolves false: fallback line, no "Copied", no throw', async () => {
    statusResponses.mockResolvedValue({ state: 'down', everSeen: false });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    render(<App videoId="vid00000001" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Copy command' }));
    expect(await screen.findByText('Select the command, then press Cmd+C')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();
  });

  test('missing clipboard API also falls back', async () => {
    statusResponses.mockResolvedValue({ state: 'down', everSeen: false });
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<App videoId="vid00000001" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Copy command' }));
    expect(await screen.findByText('Select the command, then press Cmd+C')).toBeInTheDocument();
  });
});
