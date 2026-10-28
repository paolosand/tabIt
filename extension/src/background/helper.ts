import { API_BASE } from './api';

const HEALTH_TIMEOUT_MS = 3000;

/** Probe the local helper. Anything that is not a tabIt /health answer (including no answer within 3s) counts as down. */
export async function getHelperStatus(): Promise<
  { state: 'up'; engineVersion: string } | { state: 'down' }
> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!res.ok) return { state: 'down' };
    const body = await res.json();
    if (body?.status !== 'ok' || typeof body?.engineVersion !== 'string') return { state: 'down' };
    return { state: 'up', engineVersion: body.engineVersion };
  } catch {
    return { state: 'down' };
  }
}
