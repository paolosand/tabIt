import { afterEach, beforeEach } from 'vitest';
import { setVideoTranspose } from './videoTranspose';
import { fakeAudio } from './fakeAudio';

let el: HTMLVideoElement;
beforeEach(() => {
  el = document.createElement('video');
  document.body.append(el);
});
afterEach(() => el.remove());

describe('setVideoTranspose', () => {
  it('leaves the page audio completely alone until a real shift is asked for', async () => {
    const { log, deps } = fakeAudio();
    await setVideoTranspose(0, deps);
    expect(log.contexts).toBe(0);
    expect(log.wrapped).toBe(0);
  });

  it('shifts the page <video> once a non-zero shift is requested', async () => {
    const { log, deps } = fakeAudio();
    await setVideoTranspose(2, deps);
    expect(log.wrapped).toBe(1);
    expect(log.messages).toEqual([{ ratio: 2 ** (2 / 12) }]);
  });

  it('resets an earlier shift when asked for 0 (e.g. a new song reusing the same <video>)', async () => {
    const { log, deps } = fakeAudio();
    await setVideoTranspose(3, deps);
    await setVideoTranspose(0, deps);
    expect(log.messages.at(-1)).toEqual({ ratio: 1 });
    expect(log.wrapped).toBe(1);
  });

  it('does nothing, without throwing, when the page has no <video>', async () => {
    el.remove();
    const { log, deps } = fakeAudio();
    await expect(setVideoTranspose(2, deps)).resolves.toBeUndefined();
    expect(log.contexts).toBe(0);
  });

  it('swallows audio failures so chord relabeling still works', async () => {
    const { deps } = fakeAudio();
    const broken = { ...deps, createContext: () => { throw new Error('no audio'); } };
    await expect(setVideoTranspose(2, broken)).resolves.toBeUndefined();
  });
});
