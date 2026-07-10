import '@testing-library/jest-dom';

// Minimal chrome stub: tests override members per-case with vi.spyOn/vi.fn.
(globalThis as Record<string, unknown>).chrome = {
  runtime: { sendMessage: () => Promise.resolve(undefined), onMessage: { addListener: () => {} } },
  storage: {
    session: {
      _data: {} as Record<string, unknown>,
      async get(key: string) { return { [key]: (this as { _data: Record<string, unknown> })._data[key] }; },
      async set(items: Record<string, unknown>) { Object.assign((this as { _data: Record<string, unknown> })._data, items); },
    },
  },
};
