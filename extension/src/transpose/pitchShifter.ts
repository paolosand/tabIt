/**
 * Mono time-domain pitch shifter: two read taps sweep a delay line at (1 - ratio)
 * samples per sample, half a window apart, crossfaded with Hann windows that sum to 1.
 * No dependencies so it can run unchanged inside an AudioWorkletGlobalScope.
 */
export class PitchShifter {
  private readonly buffer: Float32Array;
  private readonly mask: number;
  private readonly windowSamples: number;
  private writeIndex = 0;
  private phase = 0;
  private ratio = 1;

  constructor(sampleRate: number, windowMs = 60) {
    this.windowSamples = Math.round((sampleRate * windowMs) / 1000);
    let size = 1;
    while (size < this.windowSamples * 2) size <<= 1;
    this.buffer = new Float32Array(size);
    this.mask = size - 1;
  }

  setRatio(ratio: number): void {
    this.ratio = ratio;
  }

  process(input: Float32Array, output: Float32Array): void {
    const step = (1 - this.ratio) / this.windowSamples;
    for (let i = 0; i < input.length; i++) {
      this.buffer[this.writeIndex & this.mask] = input[i];

      const phaseB = (this.phase + 0.5) % 1;
      const wA = 0.5 - 0.5 * Math.cos(2 * Math.PI * this.phase);
      const wB = 0.5 - 0.5 * Math.cos(2 * Math.PI * phaseB);
      output[i] = this.read(this.phase) * wA + this.read(phaseB) * wB;

      this.writeIndex++;
      this.phase += step;
      this.phase -= Math.floor(this.phase);
    }
  }

  private read(phase: number): number {
    const pos = this.writeIndex - phase * this.windowSamples;
    const base = Math.floor(pos);
    const frac = pos - base;
    const a = this.buffer[base & this.mask];
    const b = this.buffer[(base + 1) & this.mask];
    return a + (b - a) * frac;
  }
}
