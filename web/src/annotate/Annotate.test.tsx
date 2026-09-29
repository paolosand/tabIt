import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import type { Chart } from '../lib/types';
import * as api from '../lib/api';
import { sampleGold } from '../lib/gold/sample.ts';
import Annotate from './Annotate.tsx';
import * as goldApi from './goldApi.ts';

vi.mock('../playback/YouTubePlayer', () => ({ default: () => <div data-testid="yt" /> }));
vi.mock('../lib/api', () => ({ analyzeUrl: vi.fn(), pollJob: vi.fn() }));
vi.mock('./goldApi.ts', () => ({
  listGold: vi.fn(), loadGold: vi.fn(), saveGold: vi.fn(() => Promise.resolve()),
}));

const chart = (videoId: string | null): Chart => ({
  schemaVersion: 1,
  source: { kind: videoId ? 'youtube' : 'file', videoId, title: 'A Song', duration: 12 },
  analysis: { engineVersion: '0.2.1', createdAt: 'now' },
  key: { tonic: 'C', mode: 'major', confidence: 0.9 }, scales: [], tempo: { bpm: 120 },
  beats: Array.from({ length: 24 }, (_, i) => i * 0.5), sections: [],
  chords: [{ start: 0, end: 4, label: 'Am', root: 'A', quality: 'min', bass: 'A', confidence: 0.5 }],
});

beforeEach(() => {
  vi.mocked(goldApi.listGold).mockResolvedValue([
    { videoId: 'abcdefghijk', title: 'Sample Song', updatedAt: '2026-09-24T00:00:00.000Z', labeledSeconds: 42 },
  ]);
  vi.mocked(goldApi.loadGold).mockReset();
  vi.mocked(api.analyzeUrl).mockReset();
  vi.mocked(api.pollJob).mockReset();
});

test('home lists saved songs and resumes one', async () => {
  vi.mocked(goldApi.loadGold).mockResolvedValue({ file: sampleGold(), needsSave: false });
  render(<Annotate />);
  await userEvent.click(await screen.findByRole('button', { name: /resume sample song/i }));
  expect(await screen.findAllByTestId('sheet-row')).not.toHaveLength(0);
});

test('a new YouTube song is analyzed, then opened as an unlabeled file', async () => {
  vi.mocked(api.analyzeUrl).mockResolvedValue('job1');
  vi.mocked(api.pollJob).mockResolvedValue(chart('vjr9Madg_sI'));
  vi.mocked(goldApi.loadGold).mockResolvedValue(null);
  render(<Annotate />);
  await userEvent.type(await screen.findByLabelText(/youtube url/i), 'https://www.youtube.com/watch?v=vjr9Madg_sI');
  await userEvent.click(screen.getByRole('button', { name: /^start$/i }));
  expect(await screen.findAllByTestId('sheet-row')).not.toHaveLength(0);
  expect(goldApi.saveGold).not.toHaveBeenCalled(); // nothing is written until the first edit
});

test('a song that is already labeled opens its saved file instead of a fresh one', async () => {
  vi.mocked(api.analyzeUrl).mockResolvedValue('job1');
  vi.mocked(api.pollJob).mockResolvedValue(chart('abcdefghijk'));
  vi.mocked(goldApi.loadGold).mockResolvedValue({
    file: sampleGold({
      spans: [{ start: 0, end: 4, root: 'A', quality: 'min', label: 'A:min', flag: 'guess', source: 'manual' }],
    }),
    needsSave: false,
  });
  render(<Annotate />);
  await userEvent.type(await screen.findByLabelText(/youtube url/i), 'https://youtu.be/abcdefghijk');
  await userEvent.click(screen.getByRole('button', { name: /^start$/i }));
  const chips = await screen.findAllByTestId('chip');
  expect(chips.some((c) => c.getAttribute('data-kind') === 'span')).toBe(true);
});

test('an uploaded file (no videoId) is refused with a clear message (Review Focus 2)', async () => {
  vi.mocked(api.analyzeUrl).mockResolvedValue('job1');
  vi.mocked(api.pollJob).mockResolvedValue(chart(null));
  render(<Annotate />);
  await userEvent.type(await screen.findByLabelText(/youtube url/i), 'https://example.com/x.wav');
  await userEvent.click(screen.getByRole('button', { name: /^start$/i }));
  expect(await screen.findByText(/needs a YouTube URL/i)).toBeInTheDocument();
});
