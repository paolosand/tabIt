import { expect, test } from 'vitest';
import type { Chart } from '../types';
import { newGoldFromChart } from './file.ts';

const chart = (over: Partial<Chart> = {}): Chart => ({
  schemaVersion: 1,
  source: { kind: 'youtube', videoId: 'vjr9Madg_sI', title: 'Write Me A Letter', duration: 195 },
  analysis: { engineVersion: '0.2.1', createdAt: 'now' },
  key: { tonic: 'C', mode: 'major', confidence: 0.89 },
  scales: [], tempo: { bpm: 129 },
  beats: [0.1, 0.6, 1.1, 1.6, 2.1, 2.6, 3.1, 3.6], sections: [],
  chords: [{ start: 0.1, end: 2.1, label: 'Am7/E', root: 'A', quality: 'min7', bass: 'E', confidence: 0.4 }],
  meter: { beatsPerBar: 4, confidence: 0.16 },
  downbeats: [1.1],
  ...over,
});

test('builds a fresh GoldFile from a chart', () => {
  const f = newGoldFromChart(chart(), 'https://www.youtube.com/watch?v=vjr9Madg_sI');
  expect(f).toMatchObject({
    schemaVersion: 1, videoId: 'vjr9Madg_sI', title: 'Write Me A Letter', duration: 195, blind: false, spans: [],
    key: { tonic: 'C', mode: 'major', source: 'engine' },
    grid: { factor: 1, nudgeSec: 0, beatsPerBar: 4, downbeatBeat: 2 },
    engine: { version: '0.2.1' },
  });
  expect(f.engine.chords[0]).toEqual({ start: 0.1, end: 2.1, root: 'A', quality: 'min7', label: 'Am7/E', confidence: 0.4 });
  expect(f.beats).toEqual(chart().beats);
});

test('the engine downbeat seeds the grid phase, reduced modulo beats-per-bar; missing downbeats default to 0', () => {
  expect(newGoldFromChart(chart({ downbeats: [3.1] }), 'u').grid.downbeatBeat).toBe(2); // beat 6 % 4
  expect(newGoldFromChart(chart({ downbeats: undefined }), 'u').grid.downbeatBeat).toBe(0);
  expect(newGoldFromChart(chart({ meter: undefined }), 'u').grid.beatsPerBar).toBe(4);
});

test('normalizes a flat tonic and maps an unknown mode to major', () => {
  const f = newGoldFromChart(chart({ key: { tonic: 'Bb', mode: 'dorian', confidence: 0.5 } }), 'u');
  expect(f.key).toEqual({ tonic: 'A#', mode: 'major', source: 'engine' });
});

test('refuses a chart with no videoId (Review Focus 2)', () => {
  const c = chart({ source: { kind: 'file', videoId: null, title: 'x.wav', duration: 10 } });
  expect(() => newGoldFromChart(c, 'u')).toThrow(/YouTube URL/);
});
