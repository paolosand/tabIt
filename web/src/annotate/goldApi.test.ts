import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { sampleGold } from '../lib/gold/sample.ts';
import { clearDraft, listGold, loadGold, readDraft, saveGold } from './goldApi.ts';

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

test('saveGold PUTs JSON and clears any draft on success', async () => {
  const fetchMock = vi.fn(() => Promise.resolve(ok({ ok: true })));
  vi.stubGlobal('fetch', fetchMock);
  const file = sampleGold();
  localStorage.setItem(`tabit:gold-draft:${file.videoId}`, JSON.stringify(file));
  await saveGold(file);
  expect(fetchMock).toHaveBeenCalledWith('/__gold/abcdefghijk', expect.objectContaining({ method: 'PUT' }));
  expect(readDraft(file.videoId)).toBeNull();
});

test('a failed save keeps a draft and rethrows; a network error does too (Review Focus 3)', async () => {
  const file = sampleGold();
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(ok({ error: 'boom' }, 500))));
  await expect(saveGold(file)).rejects.toThrow(/500/);
  expect(readDraft(file.videoId)?.videoId).toBe(file.videoId);
  clearDraft(file.videoId);
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
  await expect(saveGold(file)).rejects.toThrow();
  expect(readDraft(file.videoId)).not.toBeNull();
});

test('loadGold: 404 with no draft → null; a newer draft beats the server file and asks to re-save', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(ok({ error: 'not found' }, 404))));
  expect(await loadGold('abcdefghijk')).toBeNull();

  const server = sampleGold({ updatedAt: '2026-09-24T00:00:00.000Z' });
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(ok(server))));
  expect(await loadGold('abcdefghijk')).toEqual({ file: server, needsSave: false });

  const draft = sampleGold({ updatedAt: '2026-09-24T01:00:00.000Z', title: 'newer draft' });
  localStorage.setItem('tabit:gold-draft:abcdefghijk', JSON.stringify(draft));
  expect(await loadGold('abcdefghijk')).toEqual({ file: draft, needsSave: true });

  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(ok({ error: 'not found' }, 404))));
  expect((await loadGold('abcdefghijk'))?.needsSave).toBe(true); // draft with no server file
});

test('listGold returns the server list', async () => {
  const rows = [{ videoId: 'abcdefghijk', title: 'T', updatedAt: 'x', labeledSeconds: 3 }];
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(ok(rows))));
  expect(await listGold()).toEqual(rows);
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(ok({}, 500))));
  await expect(listGold()).rejects.toThrow();
});
