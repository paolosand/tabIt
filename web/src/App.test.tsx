import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import App from './App';
import * as api from './lib/api';

test('renders', () => {
  render(<App />);
  expect(screen.getByText(/tabIt/)).toBeInTheDocument();
});

const FAKE_CHART = {
  schemaVersion: 1,
  source: { kind: 'youtube', videoId: 'x', title: 'Song', duration: 10 },
  analysis: { engineVersion: '0.1.0', createdAt: 'now' },
  key: { tonic: 'A', mode: 'minor', confidence: 0.8 },
  scales: [{ name: 'A minor pentatonic', notes: [] }],
  tempo: { bpm: 120 }, beats: [], sections: [],
  chords: [{ start: 0, end: 5, label: 'Am', root: 'A', quality: 'min', bass: 'A', confidence: 0.9 }],
};

test('url submit walks landing -> analyzing -> sheet', async () => {
  vi.spyOn(api, 'analyzeUrl').mockResolvedValue('j1');
  vi.spyOn(api, 'pollJob').mockResolvedValue(FAKE_CHART as never);
  render(<App />);
  await userEvent.type(screen.getByPlaceholderText(/youtube.com/), 'https://youtu.be/x');
  await userEvent.click(screen.getByRole('button', { name: /find the chords/i }));
  await waitFor(() => expect(screen.getByText(/A minor pentatonic/)).toBeInTheDocument());
});

test('analysis failure returns to landing with the error', async () => {
  vi.spyOn(api, 'analyzeUrl').mockResolvedValue('j1');
  vi.spyOn(api, 'pollJob').mockRejectedValue(new Error('yt-dlp exploded'));
  render(<App />);
  await userEvent.type(screen.getByPlaceholderText(/youtube.com/), 'https://youtu.be/x');
  await userEvent.click(screen.getByRole('button', { name: /find the chords/i }));
  await waitFor(() => expect(screen.getByText(/yt-dlp exploded/)).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /find the chords/i })).toBeInTheDocument();
});
