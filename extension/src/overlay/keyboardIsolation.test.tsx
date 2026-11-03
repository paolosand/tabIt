import { act, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import FeedbackMenu from './FeedbackMenu';
import { isolateFeedbackKeys } from './keyboardIsolation';

const chart = { source: { kind: 'youtube', videoId: 'a' }, chords: [] } as never;
const KEYS = ['keydown', 'keyup', 'keypress'] as const;

let host: HTMLElement;
let shadow: ShadowRoot;
let container: HTMLElement;
let ribbon: HTMLElement;
let root: Root;
let stopIsolation: () => void;
let pageKeys: ReturnType<typeof vi.fn<(e: Event) => void>>;
let send: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  send = vi.fn(async (m: { type: string; shareUsage?: boolean }) =>
    m.type === 'GET_SHARING' ? { shareUsage: false } : m.type === 'SET_SHARING' ? { shareUsage: m.shareUsage } : { ok: true },
  );
  (globalThis as unknown as { chrome: { runtime: { sendMessage: unknown } } }).chrome.runtime.sendMessage = send;

  host = document.createElement('div');
  document.body.appendChild(host);
  shadow = host.attachShadow({ mode: 'open' });
  // Same shape as renderOverlay: a container div inside the shadow root holds the React tree.
  container = document.createElement('div');
  shadow.appendChild(container);
  ribbon = document.createElement('div');
  ribbon.setAttribute('data-testid', 'ribbon-area');
  ribbon.tabIndex = 0;
  shadow.appendChild(ribbon);
  stopIsolation = isolateFeedbackKeys(shadow);
  root = createRoot(container);
  await act(async () => root.render(<FeedbackMenu chart={chart} />));

  // Stands in for YouTube's page-level shortcut handler.
  pageKeys = vi.fn<(e: Event) => void>();
  for (const t of KEYS) document.addEventListener(t, pageKeys);
});

afterEach(async () => {
  for (const t of KEYS) document.removeEventListener(t, pageKeys);
  await act(async () => root.unmount());
  stopIsolation();
  host.remove();
});

const q = () => within(container);
const fire = (el: Element, type: (typeof KEYS)[number], key: string) =>
  fireEvent[type === 'keydown' ? 'keyDown' : type === 'keyup' ? 'keyUp' : 'keyPress'](el, {
    key,
    code: key === ' ' ? 'Space' : `Key${key.toUpperCase()}`,
    charCode: key.charCodeAt(0),
    composed: true,
  });

test('keys on the Feedback button, menu buttons and the checkbox never reach the page', async () => {
  fire(q().getByRole('button', { name: /^Feedback/ }), 'keydown', 'k');
  await userEvent.click(q().getByRole('button', { name: /^Feedback/ }));
  const targets = [
    q().getByRole('button', { name: /^Feedback/ }),
    q().getByRole('button', { name: 'Report bad transcription' }),
    q().getByRole('checkbox', { name: 'Help improve tabIt' }),
  ];
  for (const el of targets) for (const t of KEYS) for (const k of [' ', 'k', 'f', 'm', 'j', 'l', 'ArrowLeft', '1']) fire(el, t, k);
  expect(pageKeys).not.toHaveBeenCalled();
});

test('keys typed in the note textarea never reach the page, but the textarea still receives the text', async () => {
  await userEvent.click(q().getByRole('button', { name: /^Feedback/ }));
  await userEvent.click(q().getByRole('button', { name: 'Report bad transcription' }));
  const ta = (await q().findByLabelText('Optional note')) as HTMLTextAreaElement;
  for (const t of KEYS) for (const k of [' ', 'k', 'f', 'm', 'j', 'l', 'ArrowRight', '5']) fire(ta, t, k);
  expect(pageKeys).not.toHaveBeenCalled();
  fireEvent.change(ta, { target: { value: 'k f m' } });
  expect(ta.value).toBe('k f m');
});

test('React still sees the keys first: Enter sends the details and Escape closes the pop-up', async () => {
  await userEvent.click(q().getByRole('button', { name: /^Feedback/ }));
  await userEvent.click(q().getByRole('button', { name: 'Report bad transcription' }));
  const ta = (await q().findByLabelText('Optional note')) as HTMLTextAreaElement;
  await userEvent.click(q().getByRole('button', { name: 'Key' }));
  fireEvent.keyDown(ta, { key: 'Enter', composed: true });
  await vi.waitFor(() => expect(send.mock.calls.some((c) => c[0].type === 'REPORT_DETAILS')).toBe(true));
  expect(pageKeys).not.toHaveBeenCalled();

  // Escape: a fresh menu, closed by React's own handler.
  await vi.waitFor(() => expect(q().queryByRole('dialog')).toBeNull(), { timeout: 3000 });
  await userEvent.click(q().getByRole('button', { name: /^Feedback/ }));
  expect(q().getByRole('dialog')).toBeInTheDocument();
  fireEvent.keyDown(q().getByRole('checkbox', { name: 'Help improve tabIt' }), { key: 'Escape', composed: true });
  expect(q().queryByRole('dialog')).toBeNull();
  expect(pageKeys).not.toHaveBeenCalled();
});

test('Tab is not default-prevented, so focus can still move', async () => {
  await userEvent.click(q().getByRole('button', { name: /^Feedback/ }));
  const notPrevented = fireEvent.keyDown(q().getByRole('checkbox', { name: 'Help improve tabIt' }), { key: 'Tab', composed: true });
  expect(notPrevented).toBe(true);
});

test('keys outside the feedback UI (the ribbon area) still reach the page', () => {
  for (const t of KEYS) fire(ribbon, t, 'k');
  expect(pageKeys).toHaveBeenCalledTimes(3);
});

test('after the listener is removed, feedback keys reach the page again', async () => {
  stopIsolation();
  fire(q().getByRole('button', { name: /^Feedback/ }), 'keydown', 'k');
  expect(pageKeys).toHaveBeenCalledTimes(1);
});
