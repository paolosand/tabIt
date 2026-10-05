import type { GoldFile, GoldSummary } from '../lib/gold/types.ts';

const draftKey = (id: string) => `tabit:gold-draft:${id}`;

export function readDraft(id: string): GoldFile | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as GoldFile) : null;
  } catch {
    return null;
  }
}

export function writeDraft(file: GoldFile): void {
  try {
    localStorage.setItem(draftKey(file.videoId), JSON.stringify(file));
  } catch {
    // storage full or blocked: the on-disk save is still the primary path
  }
}

export function clearDraft(id: string): void {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    // ignore
  }
}

export async function listGold(): Promise<GoldSummary[]> {
  const res = await fetch('/__gold');
  if (!res.ok) throw new Error(`gold list failed: ${res.status}`);
  return (await res.json()) as GoldSummary[];
}

/** Load a song's labels. A localStorage draft newer than the on-disk file wins and asks to be re-saved. */
export async function loadGold(id: string): Promise<{ file: GoldFile; needsSave: boolean } | null> {
  const res = await fetch(`/__gold/${id}`);
  let server: GoldFile | null = null;
  if (res.ok) server = (await res.json()) as GoldFile;
  else if (res.status !== 404) throw new Error(`gold load failed: ${res.status}`);
  const draft = readDraft(id);
  if (draft && (!server || draft.updatedAt > server.updatedAt)) return { file: draft, needsSave: true };
  return server ? { file: server, needsSave: false } : null;
}

/** PUT the file. On any failure keep a draft so no labeling is lost, and rethrow. */
export async function saveGold(file: GoldFile): Promise<void> {
  try {
    const res = await fetch(`/__gold/${file.videoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(file),
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
    clearDraft(file.videoId);
  } catch (e) {
    writeDraft(file);
    throw e;
  }
}
