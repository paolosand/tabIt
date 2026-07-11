import { render, screen } from '@testing-library/react';
import { Bar } from './Bar';

test('loading checklist marks earlier steps done, current active, later pending', () => {
  render(<Bar variant="loading" step="chords" />);
  const items = screen.getAllByRole('listitem');
  expect(items.map((el) => el.textContent)).toEqual([
    expect.stringContaining('Fetch audio'),
    expect.stringContaining('Separate instruments'),
    expect.stringContaining('Find chords'),
    expect.stringContaining('Build chart'),
  ]);
  expect(items[0]).toHaveClass('tabit-check-done');
  expect(items[1]).toHaveClass('tabit-check-done');
  expect(items[2]).toHaveClass('tabit-check-active');
  expect(items[2]).toHaveAttribute('aria-current', 'step');
  expect(items[3]).toHaveClass('tabit-check-pending');
  expect(items[3]).not.toHaveAttribute('aria-current');
});

test('missing step defaults to the first step active', () => {
  render(<Bar variant="loading" />);
  const items = screen.getAllByRole('listitem');
  expect(items[0]).toHaveClass('tabit-check-active');
  expect(items[1]).toHaveClass('tabit-check-pending');
});

test('unknown step id defaults to the first step active', () => {
  render(<Bar variant="loading" step="warp-drive" />);
  expect(screen.getAllByRole('listitem')[0]).toHaveClass('tabit-check-active');
});
