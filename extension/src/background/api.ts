import type { Chart, JobState } from '../../../web/src/lib/types';

export const API_BASE = 'http://localhost:8000';

export async function fetchCachedChart(videoId: string): Promise<Chart | null> {
  const res = await fetch(`${API_BASE}/chart/${videoId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function submitAnalysis(videoId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${videoId}` }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()).jobId;
}

export async function pollJobOnce(jobId: string): Promise<JobState> {
  const res = await fetch(`${API_BASE}/analyze/${jobId}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<JobState>;
}
