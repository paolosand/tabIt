import { useEffect, useRef } from 'react';
import type { PlaybackSource } from './usePlaybackTime';

interface YTPlayerInstance {
  getCurrentTime(): number;
  destroy(): void;
}

interface YTPlayerOptions {
  videoId: string;
  playerVars?: Record<string, number>;
  events?: {
    onReady?: (event: { target: YTPlayerInstance }) => void;
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

export interface YouTubePlayerProps {
  videoId: string;
  onReady: (source: PlaybackSource) => void;
}

export default function YouTubePlayer({ videoId, onReady }: YouTubePlayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

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
            onReadyRef.current({
              getCurrentTime: () => event.target.getCurrentTime(),
            });
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
        width: 300,
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
