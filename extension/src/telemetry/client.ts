import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

export type TelemetryTable = 'charts' | 'analyses' | 'reports' | 'report_details';

const TIMEOUT_MS = 5000;

/**
 * Insert one row via PostgREST. The anon role has no SELECT grant, so every request
 * must use `Prefer: return=minimal`. Never throws; resolves false on any failure
 * (including an unconfigured build).
 *
 * Always a plain insert: `resolution=ignore-duplicates` and `?on_conflict=` both make PostgREST
 * need SELECT on the table, which anon deliberately lacks (it answers 401/42501). Duplicates are
 * rejected by the primary key instead (409, code 23505); with `duplicateOk` that counts as success.
 */
export async function insertRow(
  table: TelemetryTable,
  row: Record<string, unknown>,
  opts?: { duplicateOk?: boolean },
): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return true;
    if (opts?.duplicateOk === true && res.status === 409) {
      try {
        const body: unknown = await res.json();
        return (body as { code?: unknown } | null)?.code === '23505';
      } catch {
        return false;
      }
    }
    return false;
  } catch {
    return false;
  }
}
