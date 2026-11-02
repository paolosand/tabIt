import { getTransposer, peekTransposer, type TransposerDeps } from './transposer';

/** Shifts the audio of the YouTube page's own <video> to `semitones`. Best effort: audio
 *  trouble (blocked context, odd player state) must never break the chord overlay, so
 *  failures are swallowed. Asking for 0 before any shift is a no-op so the page audio
 *  stays untouched for anyone who never uses transpose. */
export async function setVideoTranspose(
  semitones: number,
  deps: TransposerDeps | string = chrome.runtime.getURL('worklet.js'),
): Promise<void> {
  try {
    const video = document.querySelector('video');
    if (!video) return;
    const existing = peekTransposer(video);
    if (!existing && semitones === 0) return;
    const transposer = await getTransposer(video, deps);
    transposer.setSemitones(semitones);
  } catch {
    // Audio is a bonus on top of the chord overlay; stay silent.
  }
}
