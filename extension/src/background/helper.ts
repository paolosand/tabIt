import { API_BASE } from './api';

/** Probe the local helper. Anything that is not a tabIt /health answer counts as down. */
export async function getHelperStatus(): Promise<
  { state: 'up'; engineVersion: string } | { state: 'down' }
> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) return { state: 'down' };
    const body = await res.json();
    if (typeof body?.engineVersion !== 'string') return { state: 'down' };
    return { state: 'up', engineVersion: body.engineVersion };
  } catch {
    return { state: 'down' };
  }
}
