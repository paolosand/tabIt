import type { GoldFile } from './types.ts';

/** Test factory: a 12 s song at 120 BPM (24 beats), C major, three engine chords, no spans yet. */
export function sampleGold(over: Partial<GoldFile> = {}): GoldFile {
  return {
    schemaVersion: 1,
    videoId: 'abcdefghijk',
    title: 'Sample Song',
    url: 'https://www.youtube.com/watch?v=abcdefghijk',
    duration: 12,
    key: { tonic: 'C', mode: 'major', source: 'engine' },
    grid: { factor: 1, nudgeSec: 0, beatsPerBar: 4, downbeatBeat: 0 },
    beats: Array.from({ length: 24 }, (_, i) => i * 0.5),
    engine: {
      version: '0.2.1',
      chords: [
        { start: 0, end: 4, root: 'A', quality: 'min', label: 'Am', confidence: 0.5 },
        { start: 4, end: 8, root: 'F', quality: 'maj', label: 'F', confidence: 0.5 },
        { start: 8, end: 12, root: 'C', quality: 'maj', label: 'C', confidence: 0.5 },
      ],
    },
    blind: false,
    spans: [],
    updatedAt: '2026-09-24T00:00:00.000Z',
    ...over,
  };
}
