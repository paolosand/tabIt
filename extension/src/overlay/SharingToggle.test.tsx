import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import SharingToggle from './SharingToggle';
import { SHARING_NOTE } from './copy';

let send: ReturnType<typeof vi.fn>;
function stub(impl: (m: { type: string; shareUsage?: boolean }) => unknown) {
  send = vi.fn(async (m) => impl(m));
  (globalThis as unknown as { chrome: { runtime: { sendMessage: unknown } } }).chrome.runtime.sendMessage = send;
}
beforeEach(() => stub(() => undefined));
afterEach(() => vi.restoreAllMocks());

const box = () => screen.getByRole('checkbox', { name: 'Help improve tabIt' }) as HTMLInputElement;

test('is unchecked on mount and when the response is undefined', async () => {
  render(<SharingToggle />);
  expect(box().checked).toBe(false);
  await waitFor(() => expect(send).toHaveBeenCalledWith({ type: 'GET_SHARING' }));
  expect(box().checked).toBe(false);
});

test('is checked when GET_SHARING resolves true', async () => {
  stub((m) => (m.type === 'GET_SHARING' ? { shareUsage: true } : undefined));
  render(<SharingToggle />);
  await waitFor(() => expect(box().checked).toBe(true));
});

test('non-boolean-true responses are treated as off', async () => {
  stub(() => ({ shareUsage: 'yes' }));
  render(<SharingToggle />);
  await waitFor(() => expect(send).toHaveBeenCalled());
  expect(box().checked).toBe(false);
});

test('toggling sends SET_SHARING and reflects the returned value', async () => {
  stub((m) => (m.type === 'SET_SHARING' ? { shareUsage: m.shareUsage } : { shareUsage: false }));
  render(<SharingToggle />);
  await userEvent.click(box());
  await waitFor(() => expect(box().checked).toBe(true));
  expect(send).toHaveBeenCalledWith({ type: 'SET_SHARING', shareUsage: true });
  await userEvent.click(box());
  await waitFor(() => expect(box().checked).toBe(false));
  expect(send).toHaveBeenCalledWith({ type: 'SET_SHARING', shareUsage: false });
});

test('shows the exact privacy note', () => {
  render(<SharingToggle />);
  expect(SHARING_NOTE).toBe(
    'Shares which songs you analyze and the charts tabIt makes for them, including songs that fail. No account or name.',
  );
  expect(screen.getByText(SHARING_NOTE)).toBeTruthy();
});
