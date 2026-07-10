import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useVideoTime } from './useVideoTime';
import * as page from '../content/page';

// The hook polls at ~10 Hz via requestAnimationFrame; jsdom + vitest's fake timers
// (shouldAdvanceTime, configured project-wide in vitest.config.ts) drive rAF the same
// way App.test.tsx drives setTimeout-based polling.
let mockVideo: { currentTime: number };

beforeEach(() => {
  vi.useFakeTimers();
  mockVideo = { currentTime: 0 };
  vi.spyOn(document, 'querySelector').mockImplementation((sel: string) =>
    sel === 'video' ? (mockVideo as unknown as Element) : null,
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('tracks video.currentTime while active and not ad-showing', () => {
  vi.spyOn(page, 'isAdShowing').mockReturnValue(false);
  const { result } = renderHook(() => useVideoTime(true));

  mockVideo.currentTime = 5;
  act(() => {
    vi.advanceTimersByTime(120);
  });

  expect(result.current.time).toBeCloseTo(5);
  expect(result.current.adShowing).toBe(false);
});

test('sync pauses during ad-showing: time freezes at last pre-ad value, resumes after', () => {
  const adSpy = vi.spyOn(page, 'isAdShowing').mockReturnValue(false);
  const { result } = renderHook(() => useVideoTime(true));

  // Pre-ad: normal playback at t=10.
  mockVideo.currentTime = 10;
  act(() => {
    vi.advanceTimersByTime(120);
  });
  expect(result.current.time).toBeCloseTo(10);
  expect(result.current.adShowing).toBe(false);

  // Ad starts: the <video> element's own clock jumps back to the ad's opening
  // chords (e.g. t=2). `adShowing` must flip immediately, but `time` should hold
  // at the last pre-ad value rather than following the ad's clock.
  adSpy.mockReturnValue(true);
  mockVideo.currentTime = 2;
  act(() => {
    vi.advanceTimersByTime(120);
  });
  expect(result.current.adShowing).toBe(true);
  expect(result.current.time).toBeCloseTo(10);

  // Still mid-ad, clock keeps moving on the ad's own timeline: still frozen.
  mockVideo.currentTime = 3.5;
  act(() => {
    vi.advanceTimersByTime(120);
  });
  expect(result.current.time).toBeCloseTo(10);

  // Ad ends: sync resumes automatically, following currentTime again.
  adSpy.mockReturnValue(false);
  mockVideo.currentTime = 11;
  act(() => {
    vi.advanceTimersByTime(120);
  });
  expect(result.current.adShowing).toBe(false);
  expect(result.current.time).toBeCloseTo(11);
});
