import type { Chart, JobState } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function toJson(res: Response) {
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function analyzeUrl(url: string): Promise<string> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return (await toJson(res)).jobId;
}

export async function analyzeFile(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/analyze', { method: 'POST', body: form });
  return (await toJson(res)).jobId;
}

export async function pollJob(
  jobId: string,
  opts: { intervalMs?: number; onTick?: () => void } = {},
): Promise<Chart> {
  const interval = opts.intervalMs ?? 1500;
  for (;;) {
    const state = (await toJson(await fetch(`/api/analyze/${jobId}`))) as JobState;
    if (state.status === 'done') return state.chart;
    if (state.status === 'error') throw new Error(state.error);
    opts.onTick?.();
    await sleep(interval);
  }
}
