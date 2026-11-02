import { clampSemitones, semitonesToRatio } from './ratio';

export const PROCESSOR_NAME = 'tabit-pitch-shifter';

export interface TransposerDeps {
  createContext: () => AudioContext;
  createWorkletNode: (ctx: AudioContext) => AudioWorkletNode;
  workletUrl: string;
}

export interface Transposer {
  readonly semitones: number;
  setSemitones(semitones: number): void;
}

const defaultDeps = (workletUrl: string): TransposerDeps => ({
  createContext: () => new AudioContext(),
  createWorkletNode: (ctx) => new AudioWorkletNode(ctx, PROCESSOR_NAME, { outputChannelCount: [2] }),
  workletUrl,
});

// createMediaElementSource may be called once per element, so cache per element.
const transposers = new WeakMap<HTMLMediaElement, Promise<Transposer>>();

/** The transposer already built for this element, if any (never creates one). */
export function peekTransposer(video: HTMLMediaElement): Promise<Transposer> | undefined {
  return transposers.get(video);
}

export function getTransposer(
  video: HTMLMediaElement,
  deps: TransposerDeps | string,
): Promise<Transposer> {
  const existing = transposers.get(video);
  if (existing) return existing;
  const created = build(video, typeof deps === 'string' ? defaultDeps(deps) : deps);
  transposers.set(video, created);
  return created;
}

async function build(video: HTMLMediaElement, deps: TransposerDeps): Promise<Transposer> {
  const ctx = deps.createContext();
  await ctx.audioWorklet.addModule(deps.workletUrl);
  const source = ctx.createMediaElementSource(video);
  const shifter = deps.createWorkletNode(ctx);
  // At 0 semitones the shifter would still color the sound (fixed taps comb-filter),
  // so the video bypasses it and only passes through while actually shifted.
  source.connect(ctx.destination);
  shifter.connect(ctx.destination);
  await ctx.resume();

  let current = 0;
  return {
    get semitones() { return current; },
    setSemitones(semitones) {
      const wasShifted = current !== 0;
      current = clampSemitones(semitones);
      const isShifted = current !== 0;
      if (isShifted !== wasShifted) {
        source.disconnect();
        source.connect(isShifted ? shifter : ctx.destination);
      }
      shifter.port.postMessage({ ratio: semitonesToRatio(current) });
    },
  };
}
