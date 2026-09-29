// Fails the build if any annotator/gold-store code reached the production bundle.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
if (!fs.existsSync(dist)) {
  console.error('web/dist not found — run `npm run build` first.');
  process.exit(2);
}

const MARKERS = ['__gold', 'tabit:gold-draft', 'Gold-set annotator'];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const leaks = [];
for (const file of walk(dist)) {
  if (!/\.(js|mjs|css|html|map)$/.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const marker of MARKERS) if (text.includes(marker)) leaks.push(`${path.relative(dist, file)} contains "${marker}"`);
}

if (leaks.length) {
  console.error('The dev-only annotator leaked into the production build:\n  ' + leaks.join('\n  '));
  process.exit(1);
}
console.log('ok: no annotator code in dist/');
