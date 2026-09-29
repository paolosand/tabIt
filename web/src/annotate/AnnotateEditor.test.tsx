import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { sampleGold } from '../lib/gold/sample.ts';
import AnnotateEditor from './AnnotateEditor.tsx';
import * as goldApi from './goldApi.ts';

vi.mock('../playback/YouTubePlayer', () => ({ default: () => <div data-testid="yt" /> }));
vi.mock('./goldApi.ts', () => ({ saveGold: vi.fn(() => Promise.resolve()), writeDraft: vi.fn() }));

const chips = (kind?: string) =>
  screen.queryAllByTestId('chip').filter((c) => !kind || c.getAttribute('data-kind') === kind);
const labels = (kind: string) => chips(kind).map((c) => c.getAttribute('data-label'));

beforeEach(() => vi.mocked(goldApi.saveGold).mockClear());

test('renders the engine chords as ghost chips on lead-sheet rows', () => {
  render(<AnnotateEditor file={sampleGold()} needsSave={false} onBack={() => {}} />);
  expect(screen.getAllByTestId('sheet-row')).toHaveLength(2); // 24 beats, 16 columns per row
  expect(labels('ghost')).toEqual(['A:min', 'F:maj', 'C:maj']);
  expect(chips('span')).toHaveLength(0);
});

test('a digit at the cursor confirms a matching ghost; arrows + digit split a ghost', async () => {
  const user = userEvent.setup();
  render(<AnnotateEditor file={sampleGold()} needsSave={false} onBack={() => {}} />);
  await user.keyboard('6'); // vi = Am at beat 0 = the engine's own chord
  expect(labels('span')).toEqual(['A:min']);
  expect(labels('ghost')).toEqual(['F:maj', 'C:maj']);

  await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
  await user.keyboard('5'); // beat 8 = the F ghost's first beat → G replaces it
  expect(labels('span')).toEqual(['A:min', 'G:maj']);
});

test('Enter confirms the ghost and advances; Backspace clears; ⌘Z undoes', async () => {
  const user = userEvent.setup();
  render(<AnnotateEditor file={sampleGold()} needsSave={false} onBack={() => {}} />);
  await user.keyboard('{Enter}{Enter}');
  expect(labels('span')).toEqual(['A:min', 'F:maj']);
  await user.keyboard('{Backspace}'); // cursor sits on the C ghost now: nothing to clear
  expect(labels('span')).toEqual(['A:min', 'F:maj']);
  await user.keyboard('{Meta>}z{/Meta}');
  expect(labels('span')).toEqual(['A:min']);
  await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}');
  expect(labels('span')).toEqual(['A:min', 'F:maj']);
});

test('keys typed into a select do not place chords (Review Focus 4)', async () => {
  const user = userEvent.setup();
  render(<AnnotateEditor file={sampleGold()} needsSave={false} onBack={() => {}} />);
  screen.getByLabelText(/beats per bar/i).focus();
  await user.keyboard('6');
  expect(chips('span')).toHaveLength(0);
});

test('autosaves once, debounced, with the labeled file; shows Saved', async () => {
  const user = userEvent.setup();
  render(<AnnotateEditor file={sampleGold()} needsSave={false} onBack={() => {}} />);
  expect(goldApi.saveGold).not.toHaveBeenCalled(); // an untouched file is never written
  await user.keyboard('6');
  await waitFor(() => expect(goldApi.saveGold).toHaveBeenCalledTimes(1), { timeout: 2000 });
  expect(vi.mocked(goldApi.saveGold).mock.calls[0][0].spans).toHaveLength(1);
  expect(await screen.findByText(/saved/i)).toBeInTheDocument();
});

test('a failed save shows the failure (Review Focus 3)', async () => {
  vi.mocked(goldApi.saveGold).mockRejectedValueOnce(new Error('offline'));
  const user = userEvent.setup();
  render(<AnnotateEditor file={sampleGold()} needsSave={false} onBack={() => {}} />);
  await user.keyboard('6');
  expect(await screen.findByText(/save failed/i, {}, { timeout: 2000 })).toBeInTheDocument();
});

test('a file that needs re-saving (newer draft) saves on mount', async () => {
  render(<AnnotateEditor file={sampleGold()} needsSave={true} onBack={() => {}} />);
  await waitFor(() => expect(goldApi.saveGold).toHaveBeenCalledTimes(1), { timeout: 2000 });
});

test('no beat grid: says so and offers Back instead of crashing (Review Focus 1)', async () => {
  const onBack = vi.fn();
  render(<AnnotateEditor file={sampleGold({ beats: [] })} needsSave={false} onBack={onBack} />);
  expect(screen.getByText(/no beat grid/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /back/i }));
  expect(onBack).toHaveBeenCalled();
});

test('changing the key on a labeled song asks keep vs transpose', async () => {
  const user = userEvent.setup();
  render(<AnnotateEditor file={sampleGold()} needsSave={false} onBack={() => {}} />);
  await user.keyboard('6'); // Am
  await user.selectOptions(screen.getByLabelText(/key tonic/i), 'D');
  await user.click(screen.getByRole('button', { name: /transpose the chords/i }));
  expect(labels('span')).toEqual(['B:min']); // C → D = +2 semitones
});
