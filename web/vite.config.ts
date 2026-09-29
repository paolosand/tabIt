import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { goldPlugin } from './tools/gold-plugin.ts';

export default defineConfig({
  plugins: [
    react(),
    // dev-server-only middleware that saves annotator labels into the repo
    goldPlugin(fileURLToPath(new URL('../benchmarks/gold/annotations', import.meta.url))),
  ],
  server: { proxy: { '/api': { target: 'http://localhost:28224', rewrite: (p) => p.replace(/^\/api/, '') } } },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test-setup.ts' },
});
