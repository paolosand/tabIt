import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ReportControl from './ReportControl';

const chartA = { source: { kind: 'youtube', videoId: 'a' }, chords: [] } as never;
const chartB = { source: { kind: 'youtube', videoId: 'b' }, chords: [] } as never;

let send: ReturnType<typeof vi.fn>;
beforeEach(() => {
  send = vi.fn().mockResolvedValue({ ok: true });
  (globalThis as unknown as { chrome: { runtime: { sendMessage: unknown } } }).chrome.runtime.sendMessage = send;
});
afterEach(() => vi.restoreAllMocks());

const report = () => screen.getByRole('button', { name: 'Report bad transcription' });

test('one click sends exactly one report with the chart and a uuid', async () => {
  render(<ReportControl chart={chartA} />);
  await userEvent.click(report());
  await screen.findByText('Thanks — what was off?');
  expect(send).toHaveBeenCalledTimes(1);
  const msg = send.mock.calls[0][0];
  expect(msg.type).toBe('REPORT_BAD_TRANSCRIPTION');
  expect(msg.chart).toBe(chartA);
  expect(msg.reportId).toMatch(/^[0-9a-f-]{36}$/);
});

test('follow-up sends details with same reportId and does not re-send the report', async () => {
  render(<ReportControl chart={chartA} />);
  await userEvent.click(report());
  await screen.findByText('Thanks — what was off?');
  const id = send.mock.calls[0][0].reportId;
  await userEvent.click(screen.getByRole('button', { name: 'Tempo' }));
  await userEvent.type(screen.getByLabelText('Add a note (optional)'), 'too fast');
  await userEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(send.mock.calls[1][0]).toEqual({ type: 'REPORT_DETAILS', reportId: id, reason: 'tempo', note: 'too fast' });
  expect(send.mock.calls.filter((c) => c[0].type === 'REPORT_BAD_TRANSCRIPTION')).toHaveLength(1);
});

test.each([
  ['ok false', () => send.mockResolvedValue({ ok: false })],
  ['rejected', () => send.mockRejectedValue(new Error('x'))],
  ['undefined', () => send.mockResolvedValue(undefined)],
])('failure (%s) shows a quiet error and the button stays usable', async (_n, arrange) => {
  arrange();
  render(<ReportControl chart={chartA} />);
  await userEvent.click(report());
  expect(await screen.findByText('Couldn’t send — try again')).toBeInTheDocument();
  expect(screen.queryByText('Thanks — what was off?')).not.toBeInTheDocument();
  expect(report()).toBeEnabled();
});

test('after a report the button is gone; a new chart resets it', async () => {
  const { rerender } = render(<ReportControl chart={chartA} />);
  await userEvent.click(report());
  await screen.findByText('Thanks — what was off?');
  expect(screen.queryByRole('button', { name: 'Report bad transcription' })).not.toBeInTheDocument();
  rerender(<ReportControl chart={chartB} />);
  expect(report()).toBeEnabled();
  expect(screen.queryByText('Thanks — what was off?')).not.toBeInTheDocument();
});
