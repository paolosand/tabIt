// Runs inside AudioWorkletGlobalScope: thin adapter from the Web Audio quantum to PitchShifter.
import { PitchShifter } from './pitchShifter';
import { PROCESSOR_NAME } from './transposer';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

class PitchShiftProcessor extends AudioWorkletProcessor {
  private shifters: PitchShifter[] = [];
  private ratio = 1;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<{ ratio: number }>) => {
      this.ratio = e.data.ratio;
      for (const s of this.shifters) s.setRatio(this.ratio);
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0];
    const output = outputs[0];
    for (let ch = 0; ch < output.length; ch++) {
      // Mono sources only feed channel 0; mirror it so both ears play.
      const src = input[ch] ?? input[0];
      if (!src) continue;
      if (!this.shifters[ch]) {
        this.shifters[ch] = new PitchShifter(sampleRate);
        this.shifters[ch].setRatio(this.ratio);
      }
      this.shifters[ch].process(src, output[ch]);
    }
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, PitchShiftProcessor);
