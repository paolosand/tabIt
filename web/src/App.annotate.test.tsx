import { render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import App from './App';

vi.mock('./annotate/goldApi.ts', () => ({
  listGold: vi.fn(() => Promise.resolve([])), loadGold: vi.fn(), saveGold: vi.fn(),
}));

afterEach(() => {
  window.location.hash = '';
});

test('#annotate mounts the annotator in dev; the normal landing stays the default', async () => {
  window.location.hash = '#annotate';
  const { unmount } = render(<App />);
  expect(await screen.findByRole('heading', { name: /gold-set annotator/i })).toBeInTheDocument();
  unmount();
  window.location.hash = '';
  render(<App />);
  expect(screen.queryByRole('heading', { name: /gold-set annotator/i })).not.toBeInTheDocument();
});
