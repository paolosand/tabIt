import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import Sheet from './Sheet';
import * as playback from '../playback/usePlaybackTime';

vi.mock('../playback/YouTubePlayer', () => ({
  default: () => <div data-testid="yt" />,
}));

const chart = {
  schemaVersion: 1,
  source: { kind: 'youtube', videoId: 'x', title: 'Song', duration: 20 },
  analysis: { engineVersion: '0.1.0', createdAt: 'now' },
  key: { tonic: 'A', mode: 'minor', confidence: 0.8 },
  scales: [{ name: 'A minor pentatonic', notes: [] }],
  tempo: { bpm: 120 }, beats: [], sections: [],
  chords: [
    { start: 0, end: 4, label: 'Am', root: 'A', quality: 'min', bass: 'A', confidence: 0.9 },
    { start: 4, end: 8, label: 'F', root: 'F', quality: 'maj', bass: 'F', confidence: 0.8 },
    { start: 8, end: 12, label: 'C', root: 'C', quality: 'maj', bass: 'C', confidence: 0.6 },
    { start: 12, end: 16, label: 'G', root: 'G', quality: 'maj', bass: 'G', confidence: 0.85 },
    { start: 16, end: 20, label: 'N', root: 'N', quality: 'N', bass: 'N', confidence: 0.8 },
  ],
};

test('renders chords, marks current, N is a dash', () => {
  vi.spyOn(playback, 'usePlaybackTime').mockReturnValue(5); // inside F
  render(<Sheet chart={chart as never} mediaFile={null} onBack={() => {}} />);
  expect(screen.getByText('Am')).toBeInTheDocument();
  expect(screen.getByText('—')).toBeInTheDocument();
  expect(screen.getByTestId('marker').parentElement).toHaveTextContent('F');
  expect(screen.getByText(/Now:/).parentElement).toHaveTextContent('F');
});

test('transpose relabels', async () => {
  vi.spyOn(playback, 'usePlaybackTime').mockReturnValue(0);
  render(<Sheet chart={chart as never} mediaFile={null} onBack={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /transpose up/i }));
  await userEvent.click(screen.getByRole('button', { name: /transpose up/i }));
  // Am -> Bm after +2; scope to the chord grid button since the current chord
  // (index 0, at t=0) also relabels the "Now:" footer to the same text.
  expect(screen.getByRole('button', { name: 'Bm' })).toBeInTheDocument();
});
