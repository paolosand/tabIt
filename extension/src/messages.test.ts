import type { GetChartResponse } from './messages';

test('message contract shapes compile', () => {
  const done: GetChartResponse = {
    status: 'done',
    chart: {
      schemaVersion: 1,
      source: { kind: 'youtube', videoId: 'x', duration: 1 },
      analysis: { engineVersion: '0.1.0', createdAt: 'now' },
      key: { tonic: 'A', mode: 'major', confidence: 1 },
      scales: [], tempo: { bpm: 120 }, beats: [], sections: [], chords: [],
    },
  };
  const pending: GetChartResponse = { status: 'pending' };
  const error: GetChartResponse = { status: 'error', error: 'x' };
  expect([done.status, pending.status, error.status]).toEqual(['done', 'pending', 'error']);
});
