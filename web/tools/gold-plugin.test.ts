// @vitest-environment node
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { sampleGold } from '../src/lib/gold/sample.ts';
import type { GoldFile } from '../src/lib/gold/types.ts';
import { createGoldStore, goldHandler, MAX_BODY_BYTES, type GoldStore } from './gold-plugin.ts';

let dir: string;
let store: GoldStore;
let server: http.Server | null = null;

const labeled = (): GoldFile =>
  sampleGold({
    spans: [{ start: 2, end: 4, root: 'A', quality: 'min', label: 'A:min', flag: 'guess', source: 'confirmed' }],
  });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gold-'));
  store = createGoldStore(path.join(dir, 'annotations'));
});
afterEach(async () => {
  if (server) await new Promise((r) => server!.close(r));
  server = null;
  fs.rmSync(dir, { recursive: true, force: true });
});

async function serve(): Promise<string> {
  server = http.createServer(goldHandler(store));
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('write creates json + both .lab files atomically (no tmp files left)', () => {
  const r = store.write('abcdefghijk', labeled());
  expect(r).toEqual({ ok: true });
  const a = path.join(dir, 'annotations');
  expect(fs.readdirSync(a).sort()).toEqual(['abcdefghijk.json', 'abcdefghijk.lab', 'abcdefghijk.sure.lab']);
  expect(fs.readFileSync(path.join(a, 'abcdefghijk.lab'), 'utf8')).toContain('2.000 4.000 A:min');
  expect(fs.readFileSync(path.join(a, 'abcdefghijk.sure.lab'), 'utf8')).toBe('0.000 12.000 X\n');
  const saved = JSON.parse(fs.readFileSync(path.join(a, 'abcdefghijk.json'), 'utf8'));
  expect(saved.spans[0].label).toBe('A:min');
  expect(Object.keys(saved)[0]).toBe('schemaVersion'); // canonical key order
});

test('write rejects bad ids, id/body mismatch, and invalid spans without touching disk', () => {
  expect(store.write('../etc/passwd', labeled())).toMatchObject({ ok: false, status: 400 });
  expect(store.write('zzzzzzzzzzz', labeled())).toMatchObject({ ok: false, status: 400 }); // body says abcdefghijk
  const overlap = sampleGold({
    spans: [
      { start: 2, end: 5, root: 'A', quality: 'min', label: 'A:min', flag: 'guess', source: 'manual' },
      { start: 4, end: 6, root: 'F', quality: 'maj', label: 'F:maj', flag: 'guess', source: 'manual' },
    ],
  });
  expect(store.write('abcdefghijk', overlap)).toMatchObject({ ok: false, status: 400 });
  expect(fs.existsSync(path.join(dir, 'annotations'))).toBe(false);
});

test('list and read', () => {
  expect(store.list()).toEqual([]);
  store.write('abcdefghijk', labeled());
  expect(store.list()).toEqual([
    { videoId: 'abcdefghijk', title: 'Sample Song', updatedAt: '2026-09-24T00:00:00.000Z', labeledSeconds: 2 },
  ]);
  expect(JSON.parse(store.read('abcdefghijk')!).videoId).toBe('abcdefghijk');
  expect(store.read('nopenopenop')).toBeNull();
  expect(store.read('../../x')).toBeNull();
});

test('HTTP: PUT then GET round-trip; unknown id is 404; wrong method is 405', async () => {
  const base = await serve();
  const put = await fetch(`${base}/abcdefghijk`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(labeled()),
  });
  expect(put.status).toBe(200);
  expect(await put.json()).toEqual({ ok: true });
  const list = await (await fetch(`${base}/`)).json();
  expect(list).toHaveLength(1);
  const one = await fetch(`${base}/abcdefghijk`);
  expect(((await one.json()) as { spans: unknown[] }).spans).toHaveLength(1);
  expect((await fetch(`${base}/nopenopenop`)).status).toBe(404);
  expect((await fetch(`${base}/abcdefghijk`, { method: 'DELETE' })).status).toBe(405);
});

test('HTTP: rejects non-JSON content types, bad JSON, traversal ids', async () => {
  const base = await serve();
  const text = await fetch(`${base}/abcdefghijk`, {
    method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(labeled()),
  });
  expect(text.status).toBe(415);
  const junk = await fetch(`${base}/abcdefghijk`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{not json',
  });
  expect(junk.status).toBe(400);
  const trav = await fetch(`${base}/..%2f..%2fpackage.json`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(labeled()),
  });
  expect(trav.status).toBe(400);
  expect((await fetch(`${base}/..%2f..%2fpackage.json`)).status).toBe(404);
});

test('HTTP: a body over the cap gets a 413, not a silent drop (Review Focus 5)', async () => {
  const base = await serve();
  const res = await fetch(`${base}/abcdefghijk`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: 'a'.repeat(MAX_BODY_BYTES + 10),
  });
  expect(res.status).toBe(413);
  expect(fs.existsSync(path.join(dir, 'annotations'))).toBe(false);
});
