import { getTransposer } from './transposer';
import { fakeAudio } from './fakeAudio';

const video = () => document.createElement('video');

describe('getTransposer', () => {
  it('starts with the video wired straight to the speakers, untouched by the shifter', async () => {
    const { log, deps } = fakeAudio();
    await getTransposer(video(), deps);
    expect(log.modules).toEqual(['worklet.js']);
    expect(log.connections).toEqual(['video->speakers', 'shifter->speakers']);
  });

  it('routes video -> shifter while shifted and straight back to the speakers at 0', async () => {
    const { log, deps } = fakeAudio();
    const t = await getTransposer(video(), deps);
    log.connections.length = 0;
    t.setSemitones(2);
    t.setSemitones(0);
    expect(log.connections).toEqual(['video-x', 'video->shifter', 'video-x', 'video->speakers']);
  });

  it('does not rewire when the semitones change between two shifted values', async () => {
    const { log, deps } = fakeAudio();
    const t = await getTransposer(video(), deps);
    t.setSemitones(2);
    log.connections.length = 0;
    t.setSemitones(3);
    expect(log.connections).toEqual([]);
  });

  it('wraps a given video element only once (the browser allows one source per element)', async () => {
    const { log, deps } = fakeAudio();
    const el = video();
    const [a, b] = await Promise.all([getTransposer(el, deps), getTransposer(el, deps)]);
    expect(a).toBe(b);
    expect(log.wrapped).toBe(1);
  });

  it('sends the pitch ratio for the requested semitones, clamped to ±12', async () => {
    const { log, deps } = fakeAudio();
    const t = await getTransposer(video(), deps);
    t.setSemitones(12);
    t.setSemitones(-40);
    expect(log.messages).toEqual([{ ratio: 2 }, { ratio: 0.5 }]);
    expect(t.semitones).toBe(-12);
  });

  it('resumes the audio context, which autoplay policy leaves suspended', async () => {
    const { log, deps } = fakeAudio();
    await getTransposer(video(), deps);
    expect(log.resumed).toBe(1);
  });
});
