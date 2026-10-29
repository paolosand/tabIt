import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

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

cpSync('manifest.json', 'dist/manifest.json');
cpSync('icons', 'dist/icons', { recursive: true });
console.log('built dist/');
