import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './test-setup.ts',
    // @testing-library/user-event's synthetic pointer events need the fake clock to
    // keep advancing on its own (via a real-time-driven tick) or `userEvent.click()`
    // hangs forever under a plain `vi.useFakeTimers()` — this is what lets App.test.tsx
    // call `vi.useFakeTimers()` with no options and still have clicks resolve.
    fakeTimers: { shouldAdvanceTime: true },
  },
  esbuild: { jsx: 'automatic' },
});
