// Dev bench for tuning the pitch shifter in isolation: `node spike/build.mjs`, then
// `npx serve dist-spike` and open demo.html (needs http; file:// can't load the worklet).
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist-spike', { recursive: true });
const common = { bundle: true, format: 'iife', logLevel: 'info' };
await build({ ...common, entryPoints: ['src/transpose/worklet.ts'], outfile: 'dist-spike/worklet.js' });
await build({ ...common, entryPoints: ['src/transpose/demo.ts'], outfile: 'dist-spike/demo.js' });
cpSync('spike/demo.html', 'dist-spike/demo.html');
console.log('built dist-spike/');
