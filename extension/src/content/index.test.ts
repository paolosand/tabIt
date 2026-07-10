import { vi } from 'vitest';

// Mock navigation so the test drives `onVideo` directly instead of relying on
// real yt-navigate-finish events / URL polling.
vi.mock('./navigation', () => ({ watchNavigation: vi.fn() }));
// Mock the overlay renderer (still a stub in production code) so we can assert
// on when/with-what it's invoked, and control its returned stop function.
vi.mock('../overlay/App', () => ({ renderOverlay: vi.fn() }));

import { watchNavigation } from './navigation';
import { renderOverlay } from '../overlay/App';
import { main } from './index';

/** Flush a macrotask turn: guarantees any queued MutationObserver callback
 *  (a microtask in jsdom) has run, regardless of fake/real timer mode. */
function flush() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

let onVideo: ((videoId: string | null) => void) | undefined;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.mocked(watchNavigation).mockReset();
  vi.mocked(watchNavigation).mockImplementation((cb) => {
    onVideo = cb;
    return vi.fn();
  });
  vi.mocked(renderOverlay).mockReset();
  vi.mocked(renderOverlay).mockImplementation(() => vi.fn());
});

afterEach(() => {
  // Tear down whatever pending retry/mount the test left behind so module-level
  // state (`current`/`cancelPending` in index.ts) starts clean for the next test.
  onVideo?.(null);
  onVideo = undefined;
  vi.useRealTimers();
});

test('navigation during a pending retry cancels the stale videoId (never mounts it)', async () => {
  // No insertion slot present: first navigation starts a retry, finds nothing.
  main();
  onVideo!('aaaaaaaaaaa');
  expect(renderOverlay).not.toHaveBeenCalled();

  // Second navigation arrives while the first retry is still pending. This must
  // cancel the 'aaaaaaaaaaa' observer/timeout, not just leave it running.
  onVideo!('bbbbbbbbbbb');
  expect(renderOverlay).not.toHaveBeenCalled();

  // Now the slot appears and the (single, current) MutationObserver fires.
  document.body.appendChild(Object.assign(document.createElement('div'), { id: 'below' }));
  await flush();

  expect(renderOverlay).toHaveBeenCalledTimes(1);
  expect(renderOverlay).toHaveBeenCalledWith(expect.anything(), 'bbbbbbbbbbb');
});

test('normal retry path still mounts once the slot appears', async () => {
  main();
  onVideo!('ccccccccccc');
  expect(renderOverlay).not.toHaveBeenCalled();

  document.body.appendChild(Object.assign(document.createElement('div'), { id: 'below' }));
  await flush();

  expect(renderOverlay).toHaveBeenCalledTimes(1);
  expect(renderOverlay).toHaveBeenCalledWith(expect.anything(), 'ccccccccccc');
});

test('retry gives up after the 10s cap and mounts a degraded fallback host instead', async () => {
  vi.useFakeTimers();
  main();
  onVideo!('ddddddddddd');
  // Slot never appears.
  await vi.advanceTimersByTimeAsync(11_000);
  expect(renderOverlay).toHaveBeenCalledTimes(1);
  expect(renderOverlay).toHaveBeenCalledWith(expect.anything(), 'ddddddddddd');
  const host = document.getElementById('tabit-root');
  expect(host).not.toBeNull();
  expect(host!.classList.contains('tabit-fallback')).toBe(true);
});

test('skips mounting entirely when the page reports a live stream', async () => {
  document.body.appendChild(Object.assign(document.createElement('div'), { id: 'below' }));
  document.body.appendChild(Object.assign(document.createElement('div'), { className: 'ytp-live' }));
  main();
  onVideo!('ggggggggggg');
  expect(renderOverlay).not.toHaveBeenCalled();
  expect(document.getElementById('tabit-root')).toBeNull();
});

test('live-stream guard also prevents the degraded fallback mount from firing later', async () => {
  vi.useFakeTimers();
  document.body.appendChild(Object.assign(document.createElement('div'), { className: 'ytp-live' }));
  main();
  onVideo!('hhhhhhhhhhh');
  await vi.advanceTimersByTimeAsync(11_000);
  expect(renderOverlay).not.toHaveBeenCalled();
  expect(document.getElementById('tabit-root')).toBeNull();
});
