import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, type Mock } from 'vitest';
import { App } from './App';

const CHART = {
  schemaVersion: 1,
  source: { kind: 'youtube', videoId: 'vid00000001', title: 'T', duration: 10 },
  analysis: { engineVersion: '0.1.0', createdAt: 'now' },
  key: { tonic: 'A', mode: 'major', confidence: 0.9 },
  scales: [{ name: 'A major pentatonic', notes: [] }],
  tempo: { bpm: 120 }, beats: [], sections: [],
  chords: [{ start: 0, end: 5, label: 'A', root: 'A', quality: 'maj', bass: 'A', confidence: 0.9 }],
};

beforeEach(() => {
  (chrome.runtime as { sendMessage: unknown }).sendMessage = vi.fn();
});

test('collapsed bar -> click -> done chart renders sheet', async () => {
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ status: 'done', chart: CHART });
  render(<App videoId="vid00000001" />);
  await userEvent.click(screen.getByRole('button', { name: /get chords/i }));
  await waitFor(() => expect(screen.getByText(/A major pentatonic/)).toBeInTheDocument());
  // Confirms this is the real Panel (Task 5), not the old placeholder div: the
  // sole chord ('A') is current at t=0 and carries the marker highlight.
  expect(screen.getByTestId('marker').parentElement).toHaveTextContent('A');
});

test('error response shows retry', async () => {
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ status: 'error', error: 'server unreachable' });
  render(<App videoId="vid00000001" />);
  await userEvent.click(screen.getByRole('button', { name: /get chords/i }));
  await waitFor(() => expect(screen.getByText(/server unreachable/)).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
});

test('pending keeps polling until done', async () => {
  vi.useFakeTimers();
  const send = chrome.runtime.sendMessage as Mock;
  send.mockResolvedValueOnce({ status: 'pending' }).mockResolvedValueOnce({ status: 'done', chart: CHART });
  render(<App videoId="vid00000001" />);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.click(screen.getByRole('button', { name: /get chords/i }));
  await vi.advanceTimersByTimeAsync(3100);
  await waitFor(() => expect(screen.getByText(/A major pentatonic/)).toBeInTheDocument());
  expect(send).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});

test('pending step from the background reaches the checklist', async () => {
  vi.useFakeTimers();
  const send = chrome.runtime.sendMessage as Mock;
  send
    .mockResolvedValueOnce({ status: 'pending', step: 'separate' })
    .mockResolvedValueOnce({ status: 'done', chart: CHART });
  render(<App videoId="vid00000001" />);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.click(screen.getByRole('button', { name: /get chords/i }));

  await waitFor(() =>
    expect(screen.getByText('Separate instruments')).toHaveAttribute('aria-current', 'step'),
  );
  expect(screen.getByText('Fetch audio')).toHaveClass('tabit-check-done');

  await vi.advanceTimersByTimeAsync(3100);
  await waitFor(() => expect(screen.getByText(/A major pentatonic/)).toBeInTheDocument());
  vi.useRealTimers();
});

test('offline response shows the helper-offline bar, backs off, and auto-recovers', async () => {
  vi.useFakeTimers();
  const send = chrome.runtime.sendMessage as Mock;
  send
    .mockResolvedValueOnce({ status: 'offline' })
    .mockResolvedValueOnce({ status: 'offline' })
    .mockResolvedValueOnce({ status: 'done', chart: CHART });
  render(<App videoId="vid00000001" />);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.click(screen.getByRole('button', { name: /get chords/i }));

  await waitFor(() => expect(screen.getByText(/helper isn't running/)).toBeInTheDocument());

  // first retry fires at the 3s base delay…
  await vi.advanceTimersByTimeAsync(3100);
  expect(send).toHaveBeenCalledTimes(2);

  // …the second backs off to 6s: nothing at +3s…
  await vi.advanceTimersByTimeAsync(3100);
  expect(send).toHaveBeenCalledTimes(2);

  // …but fires by +6s, and the recovered helper's chart renders
  await vi.advanceTimersByTimeAsync(3000);
  await waitFor(() => expect(screen.getByText(/A major pentatonic/)).toBeInTheDocument());
  expect(send).toHaveBeenCalledTimes(3);
  vi.useRealTimers();
});

test('manual retry from the offline bar polls immediately', async () => {
  const send = chrome.runtime.sendMessage as Mock;
  send
    .mockResolvedValueOnce({ status: 'offline' })
    .mockResolvedValueOnce({ status: 'done', chart: CHART });
  render(<App videoId="vid00000001" />);
  await userEvent.click(screen.getByRole('button', { name: /get chords/i }));
  await waitFor(() => expect(screen.getByText(/helper isn't running/)).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /retry/i }));
  await waitFor(() => expect(screen.getByText(/A major pentatonic/)).toBeInTheDocument());
});
