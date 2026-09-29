import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import YouTubePlayer, { type PlayerControls } from './YouTubePlayer';

interface Captured {
  events?: {
    onReady?: (e: { target: unknown }) => void;
    onError?: (e: { data: number }) => void;
  };
}

test('exposes seek/play/pause/rate controls, reports embed errors, honors width', async () => {
  const target = {
    getCurrentTime: vi.fn(() => 12.5), seekTo: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(),
    setPlaybackRate: vi.fn(), getPlaybackRate: vi.fn(() => 0.5), getPlayerState: vi.fn(() => 1),
    destroy: vi.fn(),
  };
  const captured: Captured = {};
  class FakePlayer {
    constructor(_el: HTMLElement, opts: Captured) {
      Object.assign(captured, opts);
    }
  }
  window.YT = { Player: FakePlayer as never };

  const box: { c?: PlayerControls } = {};
  const onError = vi.fn();
  const { container } = render(
    <YouTubePlayer videoId="abc" width={420} onReady={(c) => { box.c = c; }} onError={onError} />,
  );
  await vi.waitFor(() => expect(captured.events?.onReady).toBeDefined());
  captured.events!.onReady!({ target });

  expect(box.c!.getCurrentTime()).toBe(12.5);
  box.c!.seekTo(7);
  expect(target.seekTo).toHaveBeenCalledWith(7, true);
  box.c!.play();
  box.c!.pause();
  expect(target.playVideo).toHaveBeenCalled();
  expect(target.pauseVideo).toHaveBeenCalled();
  box.c!.setPlaybackRate(0.5);
  expect(target.setPlaybackRate).toHaveBeenCalledWith(0.5);
  expect(box.c!.getPlaybackRate()).toBe(0.5);
  expect(box.c!.isPlaying()).toBe(true);
  target.getPlayerState.mockReturnValue(2);
  expect(box.c!.isPlaying()).toBe(false);

  captured.events!.onError!({ data: 101 });
  expect(onError).toHaveBeenCalledWith(101);
  expect(container.firstElementChild).toHaveStyle({ width: '420px' });
});
