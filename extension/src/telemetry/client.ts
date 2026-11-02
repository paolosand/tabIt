import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

export type TelemetryTable = 'charts' | 'analyses' | 'reports' | 'report_details';

const TIMEOUT_MS = 5000;

/**
 * Insert one row via PostgREST. The anon role has no SELECT grant, so every request
 * must use `Prefer: return=minimal`. Never throws; resolves false on any failure
 * (including an unconfigured build).
 */
export async function insertRow(
  table: TelemetryTable,
  row: Record<string, unknown>,
  opts?: { ignoreDuplicates?: boolean },
): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const ignore = opts?.ignoreDuplicates === true;
    const query = ignore ? '?on_conflict=video_id,engine_version' : '';
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: ignore ? 'resolution=ignore-duplicates,return=minimal' : 'return=minimal',
      },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
