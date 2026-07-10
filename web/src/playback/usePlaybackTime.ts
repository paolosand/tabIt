import { useEffect, useState } from 'react';

export interface PlaybackSource { getCurrentTime(): number; }

export function usePlaybackTime(source: PlaybackSource | null): number {
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!source) return;
    let rafId = 0;
    let last = 0;
    let lastTime = -1;
    const tick = (ts: number) => {
      if (ts - last > 100) {
        last = ts;
        const t = source.getCurrentTime() || 0;
        if (Math.abs(t - lastTime) > 0.05) { lastTime = t; setTime(t); }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [source]);
  return time;
}
