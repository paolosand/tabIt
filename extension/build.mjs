import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

// Telemetry config; both empty => telemetry is a no-op.
const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

mkdirSync('dist', { recursive: true });

await build({
  entryPoints: ['src/content/index.ts'],
  bundle: true,
  format: 'iife',            // content scripts cannot be ESM
  outfile: 'dist/content.js',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  logLevel: 'info',
});

await build({
  entryPoints: ['src/background/index.ts'],
  bundle: true,
  format: 'esm',             // MV3 module service worker
  outfile: 'dist/background.js',
  define: {
    __SUPABASE_URL__: JSON.stringify(SUPABASE_URL),
    __SUPABASE_ANON_KEY__: JSON.stringify(SUPABASE_ANON_KEY),
  },
  minify: true,
  logLevel: 'info',
});

await build({
  entryPoints: ['src/transpose/worklet.ts'],
  bundle: true,
  format: 'iife',            // loaded via audioWorklet.addModule, which runs it as a plain script
  outfile: 'dist/worklet.js',
  minify: true,
  logLevel: 'info',
});

// The manifest is copied untouched: no Supabase host permission (it would disable the extension
// for existing users until they re-approve). Supabase's REST API allows cross-origin requests.
cpSync('manifest.json', 'dist/manifest.json');
cpSync('icons', 'dist/icons', { recursive: true });
console.log('built dist/');
