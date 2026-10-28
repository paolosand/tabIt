import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Bar } from './Bar';
import { INSTALL_COMMAND } from '../install';

test('offline variant explains the dead helper and offers retry', async () => {
  const onRetry = vi.fn();
  render(<Bar variant="offline" onRetry={onRetry} onCopy={async () => true} />);
  expect(screen.getByText(/tabIt isn't running/)).toBeInTheDocument();
  expect(screen.getByText('tabit restart')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /retry/i }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('loading checklist marks earlier steps done, current active, later pending', () => {
  render(<Bar variant="loading" step="chords" />);
  const items = screen.getAllByRole('listitem');
  expect(items.map((el) => el.textContent)).toEqual([
    expect.stringContaining('Fetch audio'),
    expect.stringContaining('Find chords'),
    expect.stringContaining('Build chart'),
  ]);
  expect(items[0]).toHaveClass('tabit-check-done');
  expect(items[1]).toHaveClass('tabit-check-active');
  expect(items[1]).toHaveAttribute('aria-current', 'step');
  expect(items[2]).toHaveClass('tabit-check-pending');
  expect(items[2]).not.toHaveAttribute('aria-current');
});

test('missing step defaults to the first step active', () => {
  render(<Bar variant="loading" />);
  const items = screen.getAllByRole('listitem');
  expect(items[0]).toHaveClass('tabit-check-active');
  expect(items[1]).toHaveClass('tabit-check-pending');
});

test('unknown step id defaults to the first step active', () => {
  render(<Bar variant="loading" step="warp-drive" />);
  expect(screen.getAllByRole('listitem')[0]).toHaveClass('tabit-check-active');
});

test('the checklist lists only the steps that really run', () => {
  render(<Bar variant="loading" step="ingest" />);
  expect(screen.queryByText('Separate instruments')).not.toBeInTheDocument();
  expect(screen.getAllByRole('listitem').map((el) => el.textContent)).toEqual([
    expect.stringContaining('Fetch audio'),
    expect.stringContaining('Find chords'),
    expect.stringContaining('Build chart'),
  ]);
});

test('a long server error (missing model weights) is shown in full, not cut off', () => {
  const message =
    'BTC chord weights are not in /Users/x/Library/Application Support/tabIt/models and could not be ' +
    'downloaded (offline). Connect to the internet and retry (`tabit warmup` fetches them), or download ' +
    'https://raw.githubusercontent.com/jayg996/BTC-ISMIR19/2682317/test/btc_model_large_voca.pt yourself.';
  render(<Bar variant="error" message={message} onRetry={() => {}} />);
  const el = screen.getByText(message);
  expect(el).toHaveAttribute('title', message);
  expect(el.textContent).toBe(message);
});

test('offline bar copies the restart command', async () => {
  const onCopy = vi.fn().mockResolvedValue(true);
  render(<Bar variant="offline" onRetry={() => {}} onCopy={onCopy} />);
  await userEvent.click(screen.getByRole('button', { name: /copy command/i }));
  expect(onCopy).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
});

test('setup bar shows the command, the three steps and a Copy button', () => {
  render(<Bar variant="setup" mode="install" onCopy={async () => true} />);
  expect(screen.getByText(INSTALL_COMMAND)).toBeInTheDocument();
  expect(screen.getAllByRole('listitem').map((el) => el.textContent)).toEqual([
    'Open Terminal (press Cmd+Space, type Terminal, press Return)',
    'Paste the command, press Return',
    'Come back here. This page finds tabIt on its own',
  ]);
  expect(screen.getByRole('button', { name: 'Copy command' })).toBeInTheDocument();
});

test('setup bar in update mode says it is an update', () => {
  render(<Bar variant="setup" mode="update" onCopy={async () => true} />);
  expect(screen.getByText(/needs a quick update/)).toBeInTheDocument();
  expect(screen.getByText(INSTALL_COMMAND)).toBeInTheDocument();
});

test('Copy shows "Copied" only when onCopy resolves true', async () => {
  const onCopy = vi.fn().mockResolvedValue(true);
  render(<Bar variant="setup" mode="install" onCopy={onCopy} />);
  await userEvent.click(screen.getByRole('button', { name: 'Copy command' }));
  expect(onCopy).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  expect(screen.queryByText(/press Cmd\+C/)).not.toBeInTheDocument();
});

test('when copying fails the select-and-copy fallback line is shown instead of "Copied"', async () => {
  render(<Bar variant="setup" mode="install" onCopy={vi.fn().mockResolvedValue(false)} />);
  await userEvent.click(screen.getByRole('button', { name: 'Copy command' }));
  expect(await screen.findByText('Select the command, then press Cmd+C')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();
});

test('unsupported bar has a message and no command', () => {
  render(<Bar variant="unsupported" />);
  expect(screen.getByText('tabIt needs a Mac for now')).toBeInTheDocument();
  expect(screen.queryByText(INSTALL_COMMAND)).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('collapsed bar can note that the helper just connected', () => {
  render(<Bar variant="collapsed" onGetChords={() => {}} justConnected />);
  expect(screen.getByText('Helper connected')).toBeInTheDocument();
});

test('collapsed bar shows no connected note by default', () => {
  render(<Bar variant="collapsed" onGetChords={() => {}} />);
  expect(screen.queryByText('Helper connected')).not.toBeInTheDocument();
});

test('"Copied" reverts to "Copy command" after 2s; clicking again restarts the timer', async () => {
  vi.useFakeTimers();
  try {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Bar variant="setup" mode="install" onCopy={vi.fn().mockResolvedValue(true)} />);
    await user.click(screen.getByRole('button', { name: 'Copy command' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    await user.click(screen.getByRole('button', { name: 'Copied' })); // restart
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); }); // 3s since first click
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(screen.getByRole('button', { name: 'Copy command' })).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test('unmounting while "Copied" is showing leaves no pending timer', async () => {
  vi.useFakeTimers();
  try {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = render(<Bar variant="setup" mode="install" onCopy={vi.fn().mockResolvedValue(true)} />);
    await user.click(screen.getByRole('button', { name: 'Copy command' }));
    await screen.findByRole('button', { name: 'Copied' });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
