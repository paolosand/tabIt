import { PitchShifter } from './pitchShifter';

const SR = 48000;

function sine(freq: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(SR * seconds));
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
}

/** Run a signal through a fresh shifter in 128-sample blocks (the AudioWorklet quantum). */
function shift(input: Float32Array, ratio: number): Float32Array {
  const shifter = new PitchShifter(SR);
  shifter.setRatio(ratio);
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 128) {
    shifter.process(input.subarray(i, i + 128), out.subarray(i, i + 128));
  }
  return out;
}

/** Frequency from rising zero-crossings, ignoring the first 0.25s of warm-up. */
function measureHz(signal: Float32Array): number {
  const start = Math.round(SR * 0.25);
  let crossings = 0;
  let first = -1;
  let last = -1;
  for (let i = start + 1; i < signal.length; i++) {
    if (signal[i - 1] < 0 && signal[i] >= 0) {
      if (first < 0) first = i;
      last = i;
      crossings++;
    }
  }
  return ((crossings - 1) * SR) / (last - first);
}

describe('PitchShifter', () => {
  const input = sine(440, 1.5);

  it('leaves the pitch alone at ratio 1', () => {
    expect(measureHz(shift(input, 1))).toBeCloseTo(440, -1);
  });
  it('raises an octave at ratio 2', () => {
    expect(measureHz(shift(input, 2)) / 440).toBeCloseTo(2, 1);
  });
  it('lowers an octave at ratio 0.5', () => {
    expect(measureHz(shift(input, 0.5)) / 440).toBeCloseTo(0.5, 1);
  });
  it('raises one semitone at ratio 2^(1/12)', () => {
    const ratio = 2 ** (1 / 12);
    expect(Math.abs(measureHz(shift(input, ratio)) / 440 - ratio)).toBeLessThan(0.01);
  });
  it('keeps the level roughly constant (crossfaded taps sum to unity)', () => {
    const out = shift(input, 2 ** (2 / 12));
    const tail = out.subarray(Math.round(SR * 0.5));
    let peak = 0;
    for (const s of tail) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBeGreaterThan(0.8);
    expect(peak).toBeLessThan(1.15);
  });
});
