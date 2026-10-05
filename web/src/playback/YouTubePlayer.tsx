import { useEffect, useRef } from 'react';
import type { PlaybackSource } from './usePlaybackTime';

interface YTPlayerInstance {
  getCurrentTime(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getPlayerState(): number;
  destroy(): void;
}

interface YTPlayerOptions {
  videoId: string;
  playerVars?: Record<string, number>;
  events?: {
    onReady?: (event: { target: YTPlayerInstance }) => void;
    onError?: (event: { data: number }) => void;
  };
}

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Module-level so the `<script>` tag and API-ready callback are only ever
// installed once for the whole app, no matter how many players mount.
let apiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return apiPromise;
}

/** PlaybackSource plus the transport the annotator needs. Sheet only uses getCurrentTime. */
export interface PlayerControls extends PlaybackSource {
  seekTo(seconds: number): void;
  play(): void;
  pause(): void;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  isPlaying(): boolean;
}

export interface YouTubePlayerProps {
  videoId: string;
  onReady: (controls: PlayerControls) => void;
  /** YouTube error code, e.g. 101/150 = embedding disabled for this video */
  onError?: (code: number) => void;
  width?: number;
}

export default function YouTubePlayer({ videoId, onReady, onError, width = 300 }: YouTubePlayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let player: YTPlayerInstance | null = null;

    loadYouTubeApi().then(() => {
      if (cancelled || !mountRef.current || !window.YT) return;
      player = new window.YT.Player(mountRef.current, {
        videoId,
        playerVars: { modestbranding: 1, rel: 0 },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            const target = event.target;
            onReadyRef.current({
              getCurrentTime: () => target.getCurrentTime(),
              seekTo: (seconds) => target.seekTo(seconds, true),
              play: () => target.playVideo(),
              pause: () => target.pauseVideo(),
              setPlaybackRate: (rate) => target.setPlaybackRate(rate),
              getPlaybackRate: () => target.getPlaybackRate(),
              isPlaying: () => target.getPlayerState() === 1,
            });
          },
          onError: (event) => {
            if (!cancelled) onErrorRef.current?.(event.data);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (player) {
        try {
          player.destroy();
        } catch {
          // player may already be torn down by the API itself; ignore
        }
      }
    };
  }, [videoId]);

  return (
    <div
      style={{
        flex: 'none',
        width,
        background: '#000',
        borderRadius: 3,
        overflow: 'hidden',
        boxShadow: '0 6px 18px oklch(0.28 0.02 70 / 0.18)',
      }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
        <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      </div>
    </div>
  );
}
