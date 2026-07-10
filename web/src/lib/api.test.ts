import { afterEach, expect, test, vi } from 'vitest';
import { analyzeUrl, pollJob } from './api';

afterEach(() => vi.restoreAllMocks());

test('analyzeUrl posts and returns jobId', async () => {
  const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ jobId: 'j1' }), { status: 202 }));
  await expect(analyzeUrl('https://youtu.be/x')).resolves.toBe('j1');
  expect(mock).toHaveBeenCalledWith('/api/analyze', expect.objectContaining({ method: 'POST' }));
});

test('pollJob resolves when done', async () => {
  const chart = { schemaVersion: 1 };
  const responses = [
    new Response(JSON.stringify({ status: 'pending' })),
    new Response(JSON.stringify({ status: 'done', chart })),
  ];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => responses.shift()!);
  await expect(pollJob('j1', { intervalMs: 1 })).resolves.toEqual(chart);
});

test('pollJob rejects on error status', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ status: 'error', error: 'yt-dlp exploded' })));
  await expect(pollJob('j1', { intervalMs: 1 })).rejects.toThrow('yt-dlp exploded');
});
