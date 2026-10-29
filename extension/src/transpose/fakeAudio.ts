// Test helper: records the audio graph the transposer builds; stands in for the browser's Web Audio.
export function fakeAudio() {
  const log = { wrapped: 0, contexts: 0, connections: [] as string[], messages: [] as unknown[], modules: [] as string[], resumed: 0 };
  const node = (name: string) => ({
    name,
    connect(to: { name: string }) { log.connections.push(`${name}->${to.name}`); return to; },
    disconnect() { log.connections.push(`${name}-x`); },
  });
  const ctx = {
    state: 'suspended',
    destination: node('speakers'),
    audioWorklet: { addModule: async (url: string) => { log.modules.push(url); } },
    createMediaElementSource: () => { log.wrapped++; return node('video'); },
    resume: async () => { log.resumed++; },
  };
  const createWorkletNode = () => ({
    ...node('shifter'),
    port: { postMessage: (m: unknown) => log.messages.push(m) },
  });
  return {
    log,
    deps: {
      createContext: () => { log.contexts++; return ctx as never; },
      createWorkletNode: createWorkletNode as never,
      workletUrl: 'worklet.js',
    },
  };
}
