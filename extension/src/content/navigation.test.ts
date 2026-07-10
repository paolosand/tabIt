import { vi } from 'vitest';
import { watchNavigation } from './navigation';

test('fires immediately and on yt-navigate-finish, dedupes', () => {
  vi.useFakeTimers();
  history.pushState({}, '', '/watch?v=aaaaaaaaaaa');
  const seen: (string | null)[] = [];
  const stop = watchNavigation((v) => seen.push(v));
  expect(seen).toEqual(['aaaaaaaaaaa']);

  document.dispatchEvent(new Event('yt-navigate-finish'));       // same id -> dedupe
  expect(seen).toEqual(['aaaaaaaaaaa']);

  history.pushState({}, '', '/watch?v=bbbbbbbbbbb');
  document.dispatchEvent(new Event('yt-navigate-finish'));
  expect(seen).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);

  history.pushState({}, '', '/feed/library');
  vi.advanceTimersByTime(1100);                                    // URL-poll fallback
  expect(seen).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', null]);

  stop();
  history.pushState({}, '', '/watch?v=ccccccccccc');
  vi.advanceTimersByTime(2000);
  expect(seen.length).toBe(3);                                     // stopped
  vi.useRealTimers();
});
