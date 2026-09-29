import type { Chart } from '../types';
import { nameOf, pcOf } from './degrees.ts';
import type { GoldFile } from './types.ts';

/** Snapshot the engine's chart into a fresh, unlabeled GoldFile. */
export function newGoldFromChart(chart: Chart, url: string): GoldFile {
  const videoId = chart.source.videoId;
  if (!videoId) {
    throw new Error('Annotate needs a YouTube URL — uploaded files have no video ID to save under.');
  }
  const beatsPerBar = chart.meter?.beatsPerBar ?? 4;
  const firstDown = chart.downbeats?.[0];
  const idx = firstDown === undefined ? -1 : chart.beats.findIndex((b) => Math.abs(b - firstDown) < 0.02);
  return {
    schemaVersion: 1,
    videoId,
    title: chart.source.title ?? videoId,
    url,
    duration: chart.source.duration,
    key: {
      tonic: nameOf(pcOf(chart.key.tonic)),
      mode: chart.key.mode === 'minor' ? 'minor' : 'major',
      source: 'engine',
    },
    grid: { factor: 1, nudgeSec: 0, beatsPerBar, downbeatBeat: idx >= 0 ? idx % beatsPerBar : 0 },
    beats: chart.beats,
    engine: {
      version: chart.analysis.engineVersion,
      chords: chart.chords.map((c) => ({
        start: c.start, end: c.end, root: c.root, quality: c.quality, label: c.label, confidence: c.confidence,
      })),
    },
    blind: false,
    spans: [],
    updatedAt: new Date().toISOString(),
  };
}
