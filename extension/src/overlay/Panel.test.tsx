import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import Panel from './Panel';
import * as videoTime from './useVideoTime';

// Mirrors web/src/screens/Sheet.test.tsx's fixture, minus mediaFile (the extension
// has no media column — see Panel.tsx delta 1).
const chart = {
  schemaVersion: 1,
  source: { kind: 'youtube', videoId: 'x', title: 'Song', duration: 20 },
  analysis: { engineVersion: '0.1.0', createdAt: 'now' },
  key: { tonic: 'A', mode: 'minor', confidence: 0.8 },
  scales: [{ name: 'A minor pentatonic', notes: [] }],
  tempo: { bpm: 120 },
  beats: [],
  sections: [],
  chords: [
    { start: 0, end: 4, label: 'Am', root: 'A', quality: 'min', bass: 'A', confidence: 0.9 },
    { start: 4, end: 8, label: 'F', root: 'F', quality: 'maj', bass: 'F', confidence: 0.8 },
    { start: 8, end: 12, label: 'C', root: 'C', quality: 'maj', bass: 'C', confidence: 0.6 },
    { start: 12, end: 16, label: 'G', root: 'G', quality: 'maj', bass: 'G', confidence: 0.85 },
    { start: 16, end: 20, label: 'N', root: 'N', quality: 'N', bass: 'N', confidence: 0.8 },
  ],
};

test('renders chords, marks current, N is a dash', () => {
  vi.spyOn(videoTime, 'useVideoTime').mockReturnValue({ time: 5, adShowing: false }); // inside F
  render(<Panel chart={chart as never} onCollapse={() => {}} />);
  expect(screen.getByText('Am')).toBeInTheDocument();
  expect(screen.getByText('—')).toBeInTheDocument();
  expect(screen.getByTestId('marker').parentElement).toHaveTextContent('F');
  expect(screen.getByText(/Now:/).parentElement).toHaveTextContent('F');
});

test('transpose relabels chords and the scales chip', async () => {
  vi.spyOn(videoTime, 'useVideoTime').mockReturnValue({ time: 0, adShowing: false });
  render(<Panel chart={chart as never} onCollapse={() => {}} />);
  expect(screen.getByText('A minor pentatonic')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /transpose up/i }));
  await userEvent.click(screen.getByRole('button', { name: /transpose up/i }));
  // Am -> Bm after +2 semitones. At t=0 the current chord is index 0 (Am), so both
  // the grid cell and the "Now:" footer relabel to "Bm" - scope to the marker's
  // cell (chords are plain non-interactive spans per delta 2, no button role).
  expect(screen.getByTestId('marker').parentElement).toHaveTextContent('Bm');
  expect(screen.getByText('B minor pentatonic')).toBeInTheDocument();
});

test('ad playing dims the sheet and shows a tag', () => {
  vi.spyOn(videoTime, 'useVideoTime').mockReturnValue({ time: 0, adShowing: true });
  render(<Panel chart={chart as never} onCollapse={() => {}} />);
  expect(screen.getByTestId('ad-tag')).toHaveTextContent(/ad playing/i);
});

test('collapse button calls onCollapse', async () => {
  vi.spyOn(videoTime, 'useVideoTime').mockReturnValue({ time: 0, adShowing: false });
  const onCollapse = vi.fn();
  render(<Panel chart={chart as never} onCollapse={onCollapse} />);
  await userEvent.click(screen.getByRole('button', { name: /collapse/i }));
  expect(onCollapse).toHaveBeenCalledOnce();
});
