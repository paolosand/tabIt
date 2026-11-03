import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import FeedbackMenu from './FeedbackMenu';

const chartA = { source: { kind: 'youtube', videoId: 'a' }, chords: [] } as never;
const chartB = { source: { kind: 'youtube', videoId: 'b' }, chords: [] } as never;

type Msg = { type: string; shareUsage?: boolean; reportId?: string; reason?: string; note?: string; chart?: unknown };
let send: ReturnType<typeof vi.fn>;
function stub(impl: (m: Msg) => unknown) {
  send = vi.fn(async (m: Msg) => impl(m));
  (globalThis as unknown as { chrome: { runtime: { sendMessage: unknown } } }).chrome.runtime.sendMessage = send;
}
const happy = (m: Msg) => (m.type === 'GET_SHARING' ? { shareUsage: false } : m.type === 'SET_SHARING' ? { shareUsage: m.shareUsage } : { ok: true });
beforeEach(() => stub(happy));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const trigger = () => screen.getByRole('button', { name: /^Feedback/ });
const openMenu = async () => {
  await userEvent.click(trigger());
  return screen.getByRole('dialog', { name: 'Feedback' });
};
const reportBtn = () => screen.getByRole('button', { name: 'Report bad transcription' });
const box = () => screen.getByRole('checkbox', { name: 'Help improve tabIt' }) as HTMLInputElement;
const reportDialog = () => screen.getByRole('dialog', { name: 'Report bad transcription' });
const note = () => screen.getByLabelText('Optional note') as HTMLTextAreaElement;
const detailCalls = () => send.mock.calls.filter((c) => c[0].type === 'REPORT_DETAILS');
const reportCalls = () => send.mock.calls.filter((c) => c[0].type === 'REPORT_BAD_TRANSCRIPTION');

// ---------- row + menu ----------

test('closed by default: only the Feedback button, no dialog, no status', () => {
  render(<FeedbackMenu chart={chartA} />);
  expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog');
  expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByText('Report sent')).toBeNull();
  expect(screen.queryByText('Reported')).toBeNull();
});

test('the menu shows the report row, sharing toggle, what is shared and the privacy link', async () => {
  render(<FeedbackMenu chart={chartA} />);
  const dlg = await openMenu();
  expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  expect(within(dlg).getByText('Wrong chords?')).toBeInTheDocument();
  expect(reportBtn()).toBeEnabled();
  expect(box().checked).toBe(false);
  for (const t of [
    'Songs you analyze (video ID and title)',
    'The chart tabIt makes for each song',
    'Songs that fail, with a short error',
    'Never your audio, account or browsing history. No name attached.',
  ]) {
    expect(within(dlg).getByText(t)).toBeInTheDocument();
  }
  const link = within(dlg).getByRole('link', { name: 'Read the privacy policy' });
  expect(link).toHaveAttribute('href', 'https://github.com/paolosand/tabIt/blob/main/PRIVACY.md');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  expect(dlg.textContent).not.toMatch(/[—–]/);
});

test('opening the menu moves focus inside it; Escape closes it and returns focus to the button', async () => {
  render(<FeedbackMenu chart={chartA} />);
  const dlg = await openMenu();
  expect(dlg.contains(document.activeElement)).toBe(true);
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger());
});

test('clicking the button again closes the menu', async () => {
  render(<FeedbackMenu chart={chartA} />);
  await openMenu();
  await userEvent.click(trigger());
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('clicking outside closes the menu', async () => {
  render(
    <div>
      <button type="button">elsewhere</button>
      <FeedbackMenu chart={chartA} />
    </div>,
  );
  await openMenu();
  await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'elsewhere' }));
});

// ---------- report flow ----------

test('one click sends exactly one report with the chart and a uuid, then shows the report pop-up', async () => {
  render(<FeedbackMenu chart={chartA} />);
  await openMenu();
  await userEvent.click(reportBtn());
  const dlg = await screen.findByRole('dialog', { name: 'Report bad transcription' });
  expect(screen.queryByRole('dialog', { name: 'Feedback' })).toBeNull();
  expect(reportCalls()).toHaveLength(1);
  const msg = reportCalls()[0][0];
  expect(msg.chart).toBe(chartA);
  expect(msg.reportId).toMatch(/^[0-9a-f-]{36}$/);
  expect(within(dlg).getByText('What was off?')).toBeInTheDocument();
  expect(note()).toHaveAttribute('maxlength', '500');
  expect(note()).toHaveAttribute('placeholder', 'Add a note (optional)');
  expect(note().getAttribute('rows')).toBe('2');
  expect(document.activeElement).toBe(note());
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  for (const r of ['Chords', 'Key', 'Tempo', 'Other']) {
    expect(within(dlg).getByRole('button', { name: r })).toHaveAttribute('aria-pressed', 'false');
  }
});

test('the row reads "Report sent" while the form is open and an aria-live region announces it', async () => {
  const { container } = render(<FeedbackMenu chart={chartA} />);
  const live = container.querySelector('[aria-live="polite"]')!;
  expect(live).not.toBeNull();
  expect(live.textContent).toBe('');
  await openMenu();
  await userEvent.click(reportBtn());
  await screen.findByRole('dialog', { name: 'Report bad transcription' });
  expect(live.textContent).toBe('Report sent');
  expect(container.querySelector('[aria-live="polite"]')).toBe(live); // persistent, never remounted
});

test('details send the same reportId, show thanks, then close after about 1800 ms and read "Reported"', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { container } = render(<FeedbackMenu chart={chartA} />);
  await openMenu();
  await userEvent.click(reportBtn());
  await screen.findByRole('dialog', { name: 'Report bad transcription' });
  const id = reportCalls()[0][0].reportId;
  await userEvent.click(screen.getByRole('button', { name: 'Tempo' }));
  await userEvent.type(note(), 'too fast');
  await userEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(detailCalls()).toHaveLength(1));
  expect(detailCalls()[0][0]).toEqual({ type: 'REPORT_DETAILS', reportId: id, reason: 'tempo', note: 'too fast' });
  expect(reportCalls()).toHaveLength(1);
  expect(within(reportDialog()).getByText('Thanks, noted.')).toBeInTheDocument();
  expect(container.querySelector('[aria-live="polite"]')!.textContent).toBe('Thanks, noted.');
  act(() => {
    vi.advanceTimersByTime(1900);
  });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(container.querySelector('[aria-live="polite"]')!.textContent).toBe('Reported');
  expect(screen.getByText('Reported', { selector: '.tabit-fb-status' })).toBeInTheDocument();
  expect(document.activeElement).toBe(trigger());
});

test('Enter sends once a chip is chosen; Shift+Enter inserts a newline instead', async () => {
  render(<FeedbackMenu chart={chartA} />);
  await openMenu();
  await userEvent.click(reportBtn());
  await screen.findByRole('dialog', { name: 'Report bad transcription' });
  await userEvent.type(note(), 'a{Enter}b');
  expect(detailCalls()).toHaveLength(0); // no chip yet: Enter does not send
  await userEvent.click(screen.getByRole('button', { name: 'Chords' }));
  await userEvent.type(note(), '{Shift>}{Enter}{/Shift}c');
  expect(detailCalls()).toHaveLength(0);
  expect(note().value).toBe('a\nb\nc');
  await userEvent.type(note(), '{Enter}');
  await waitFor(() => expect(detailCalls()).toHaveLength(1));
  expect(detailCalls()[0][0].reason).toBe('chords');
});

test('clicking a chip toggles it without replacing the pop-up element', async () => {
  render(<FeedbackMenu chart={chartA} />);
  await openMenu();
  await userEvent.click(reportBtn());
  const dlg = await screen.findByRole('dialog', { name: 'Report bad transcription' });
  const ta = note();
  await userEvent.click(screen.getByRole('button', { name: 'Key' }));
  expect(screen.getByRole('button', { name: 'Key' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.type(note(), 'hello');
  await userEvent.click(screen.getByRole('button', { name: 'Tempo' }));
  expect(screen.getByRole('button', { name: 'Key' })).toHaveAttribute('aria-pressed', 'false');
  // Same DOM nodes throughout: React did not remount, so the fade-in cannot replay.
  expect(reportDialog()).toBe(dlg);
  expect(note()).toBe(ta);
  expect(note().value).toBe('hello');
});

test('Escape, Skip and an outside click close the form without sending details; the row reads Reported', async () => {
  for (const close of [
    async () => userEvent.keyboard('{Escape}'),
    async () => userEvent.click(screen.getByRole('button', { name: 'Skip' })),
    async () => userEvent.click(screen.getByRole('button', { name: 'elsewhere' })),
  ]) {
    send.mockClear();
    const { unmount } = render(
      <div>
        <button type="button">elsewhere</button>
        <FeedbackMenu chart={chartA} />
      </div>,
    );
    await openMenu();
    await userEvent.click(reportBtn());
    await screen.findByRole('dialog', { name: 'Report bad transcription' });
    await close();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(detailCalls()).toHaveLength(0);
    expect(reportCalls()).toHaveLength(1);
    expect(screen.getByText('Reported', { selector: '.tabit-fb-status' })).toBeInTheDocument();
    unmount();
  }
});

test('a failed REPORT_DETAILS still shows the thanks (details are optional)', async () => {
  stub((m) => (m.type === 'REPORT_DETAILS' ? Promise.reject(new Error('x')) : happy(m)));
  render(<FeedbackMenu chart={chartA} />);
  await openMenu();
  await userEvent.click(reportBtn());
  await screen.findByRole('dialog', { name: 'Report bad transcription' });
  await userEvent.click(screen.getByRole('button', { name: 'Other' }));
  await userEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await within(reportDialog()).findByText('Thanks, noted.')).toBeInTheDocument();
});

test.each([
  ['ok false', () => stub((m) => (m.type === 'REPORT_BAD_TRANSCRIPTION' ? { ok: false } : happy(m)))],
  ['rejected', () => stub((m) => (m.type === 'REPORT_BAD_TRANSCRIPTION' ? Promise.reject(new Error('x')) : happy(m)))],
  ['undefined', () => stub((m) => (m.type === 'REPORT_BAD_TRANSCRIPTION' ? undefined : happy(m)))],
])('failure (%s) shows a quiet error in the menu and the button stays usable', async (_n, arrange) => {
  arrange();
  render(<FeedbackMenu chart={chartA} />);
  await openMenu();
  await userEvent.click(reportBtn());
  expect(await screen.findByText("Couldn't send, try again")).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Report bad transcription' })).toBeNull();
  expect(screen.getByRole('dialog', { name: 'Feedback' })).toBeInTheDocument();
  expect(reportBtn()).toBeEnabled();
  expect(screen.queryByText('Reported')).toBeNull();
});

test('after a report the menu says "Reported for this song"; a new chart resets everything', async () => {
  const { rerender } = render(<FeedbackMenu chart={chartA} />);
  await openMenu();
  await userEvent.click(reportBtn());
  await screen.findByRole('dialog', { name: 'Report bad transcription' });
  await userEvent.keyboard('{Escape}');
  await userEvent.click(trigger());
  expect(screen.getByText('Reported for this song')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Report bad transcription' })).toBeNull();
  rerender(<FeedbackMenu chart={chartB} />);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByText('Reported')).toBeNull();
  await userEvent.click(trigger());
  expect(reportBtn()).toBeEnabled();
});

test('a report that resolves after the chart changed does not mark the new chart as reported', async () => {
  let release!: (v: unknown) => void;
  stub((m) => (m.type === 'REPORT_BAD_TRANSCRIPTION' ? new Promise((r) => { release = r; }) : happy(m)));
  const { rerender } = render(<FeedbackMenu chart={chartA} />);
  await openMenu();
  await userEvent.click(reportBtn());
  rerender(<FeedbackMenu chart={chartB} />);
  await act(async () => release({ ok: true }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByText('Reported')).toBeNull();
  await userEvent.click(trigger());
  expect(reportBtn()).toBeEnabled();
});

// ---------- sharing (ported from SharingToggle.test.tsx) ----------

test('GET_SHARING is fetched on mount only, not when the menu opens', async () => {
  render(<FeedbackMenu chart={chartA} />);
  await waitFor(() => expect(send).toHaveBeenCalledWith({ type: 'GET_SHARING' }));
  await openMenu();
  await userEvent.keyboard('{Escape}');
  await openMenu();
  expect(send.mock.calls.filter((c) => c[0].type === 'GET_SHARING')).toHaveLength(1);
});

test('is checked when GET_SHARING resolves true', async () => {
  stub((m) => (m.type === 'GET_SHARING' ? { shareUsage: true } : undefined));
  render(<FeedbackMenu chart={chartA} />);
  await waitFor(() => expect(send).toHaveBeenCalled());
  await openMenu();
  await waitFor(() => expect(box().checked).toBe(true));
});

test.each([[{ shareUsage: 'true' }], [{ shareUsage: 1 }], [{ shareUsage: null }], [{}], [undefined], [{ error: 'unavailable' }]])(
  'non-boolean-true answer %j is treated as off',
  async (reply) => {
    stub(() => reply);
    render(<FeedbackMenu chart={chartA} />);
    await waitFor(() => expect(send).toHaveBeenCalled());
    await openMenu();
    expect(box().checked).toBe(false);
  },
);

test('toggling sends SET_SHARING with the new value and shows the confirmed value', async () => {
  render(<FeedbackMenu chart={chartA} />);
  await openMenu();
  await userEvent.click(box());
  await waitFor(() => expect(box().checked).toBe(true));
  expect(send).toHaveBeenCalledWith({ type: 'SET_SHARING', shareUsage: true });
  await userEvent.click(box());
  await waitFor(() => expect(box().checked).toBe(false));
  expect(send).toHaveBeenCalledWith({ type: 'SET_SHARING', shareUsage: false });
});

const SHARE_ERR = "Couldn't change this, try again";

test('a rejected turn-off keeps the box ON and shows the error inside the menu', async () => {
  stub((m) => {
    if (m.type === 'GET_SHARING') return { shareUsage: true };
    throw new Error('port closed');
  });
  render(<FeedbackMenu chart={chartA} />);
  await openMenu();
  await waitFor(() => expect(box().checked).toBe(true));
  await userEvent.click(box());
  await waitFor(() => expect(screen.getByText(SHARE_ERR)).toBeInTheDocument());
  expect(screen.getByRole('dialog', { name: 'Feedback' })).toContainElement(screen.getByText(SHARE_ERR));
  expect(box().checked).toBe(true);
});

test('SET_SHARING answering undefined keeps the previous value and shows the error', async () => {
  stub((m) => (m.type === 'GET_SHARING' ? { shareUsage: true } : undefined));
  render(<FeedbackMenu chart={chartA} />);
  await openMenu();
  await waitFor(() => expect(box().checked).toBe(true));
  await userEvent.click(box());
  await waitFor(() => expect(screen.getByText(SHARE_ERR)).toBeInTheDocument());
  expect(box().checked).toBe(true);
});

test('the explicit { error: "unavailable" } reply keeps the previous value', async () => {
  stub((m) => (m.type === 'GET_SHARING' ? { shareUsage: false } : { error: 'unavailable' }));
  render(<FeedbackMenu chart={chartA} />);
  await openMenu();
  await userEvent.click(box());
  await waitFor(() => expect(screen.getByText(SHARE_ERR)).toBeInTheDocument());
  expect(box().checked).toBe(false);
});

test('the error clears after a later successful change', async () => {
  let fail = true;
  stub((m) => {
    if (m.type === 'GET_SHARING') return { shareUsage: false };
    return fail ? undefined : { shareUsage: m.shareUsage };
  });
  render(<FeedbackMenu chart={chartA} />);
  await openMenu();
  await userEvent.click(box());
  await waitFor(() => expect(screen.getByText(SHARE_ERR)).toBeInTheDocument());
  fail = false;
  await userEvent.click(box());
  await waitFor(() => expect(box().checked).toBe(true));
  expect(screen.queryByText(SHARE_ERR)).toBeNull();
});

test('a slow initial GET_SHARING reply cannot overwrite a later user choice', async () => {
  let releaseGet!: (v: unknown) => void;
  stub((m) => {
    if (m.type === 'GET_SHARING') return new Promise((r) => { releaseGet = r; });
    return { shareUsage: m.shareUsage };
  });
  render(<FeedbackMenu chart={chartA} />);
  await openMenu();
  await userEvent.click(box());
  await waitFor(() => expect(box().checked).toBe(true));
  releaseGet({ shareUsage: false });
  await new Promise((r) => setTimeout(r, 20));
  expect(box().checked).toBe(true);
});

test('keyboard: the checkbox toggles with Space', async () => {
  render(<FeedbackMenu chart={chartA} />);
  await openMenu();
  box().focus();
  await userEvent.keyboard(' ');
  await waitFor(() => expect(box().checked).toBe(true));
  fireEvent.keyDown(box(), { key: 'Tab' });
});
