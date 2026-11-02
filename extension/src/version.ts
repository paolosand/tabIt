/** Oldest helper engine the extension works with; anything older is "needs update". */
export const MIN_ENGINE_VERSION = '0.4.0';

/** Helper version the extension would like users to be on; older (but still working)
 *  helpers get a soft "newer helper available" notice. Bump it only when a release carries
 *  helper changes users should want, to that release's version (see docs/RELEASING.md). */
export const RECOMMENDED_ENGINE_VERSION = '0.6.0';

function parse(v: string): number[] | null {
  const core = v.split('-')[0];
  if (!/^\d+(\.\d+)*$/.test(core)) return null;
  return core.split('.').map(Number);
}

/** Numeric dotted compare; drops a `-suffix`; unparseable input is never "older". */
export function isOlderThan(version: string, minimum: string): boolean {
  const a = parse(version);
  const b = parse(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
