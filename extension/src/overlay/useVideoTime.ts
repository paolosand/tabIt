import { useEffect, useState } from 'react';
import { isAdShowing } from '../content/page';

export interface VideoTimeState {
  time: number;
  adShowing: boolean;
}

/** Port of web/src/playback/usePlaybackTime.ts for the extension context: reads the
 *  YouTube page's own <video> element (rather than an owned player instance) at ~10 Hz
 *  via requestAnimationFrame, and additionally reports whether an ad is currently showing
 *  so callers can pause chord-following during ad breaks. No-ops entirely when `active`
 *  is false (no rAF loop is even started), so it costs nothing while the bar is collapsed. */
export function useVideoTime(active: boolean): VideoTimeState {
  const [state, setState] = useState<VideoTimeState>({ time: 0, adShowing: false });

  useEffect(() => {
    if (!active) return;

    let rafId = 0;
    let last = 0;
    let lastTime = -1;
    let lastAd: boolean | null = null;

    const tick = (ts: number) => {
      if (ts - last > 100) {
        last = ts;
        const video = document.querySelector('video');
        const t = video?.currentTime ?? 0;
        const ad = isAdShowing(document);
        // While an ad is showing, the page's <video> element is the AD's clock, not
        // the song's - hold the last pre-ad time so the marker doesn't jump to the
        // ad's opening chords. `adShowing` itself still updates every tick so the
        // UI can react immediately, and sync resumes automatically once the ad clears.
        const reportedTime = ad ? lastTime : t;
        if (Math.abs(t - lastTime) > 0.05 || ad !== lastAd) {
          if (!ad) lastTime = t;
          lastAd = ad;
          setState({ time: reportedTime, adShowing: ad });
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [active]);

  return state;
}
