import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

describe('manifest', () => {
  it('declares the four store icon sizes', () => {
    expect(Object.keys(manifest.icons ?? {}).sort()).toEqual(['128', '16', '32', '48']);
  });

  it.each(['16', '32', '48', '128'])('icon %s exists and is a square PNG of that size', (size) => {
    const rel: string = manifest.icons[size];
    expect(rel).toMatch(/^icons\/[^/]+\.png$/);
    const path = resolve(root, rel);
    expect(existsSync(path)).toBe(true);
    const buf = readFileSync(path);
    expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(buf.readUInt32BE(16)).toBe(Number(size));
    expect(buf.readUInt32BE(20)).toBe(Number(size));
  });

  it('keeps permissions minimal', () => {
    expect(manifest.permissions).toEqual(['storage']);
    expect(manifest.host_permissions).toEqual(['http://localhost:28224/*']);
  });

  it('version matches package.json', () => {
    expect(manifest.version).toBe(pkg.version);
  });
});
