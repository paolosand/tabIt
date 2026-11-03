// Backwards-compatibility guard (docs/superpowers/specs/2026-11-02-helper-updates-design.md):
// the real client code and Panel must work with every recorded helper version.
// Fixtures are written by `python -m tests.compat.record <version>` at release time.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { fetchCachedChart, pollJobOnce, submitAnalysis } from './background/api';
import { handleGetHelperStatus } from './background/handler';
import { getHelperStatus } from './background/helper';
import Panel from './overlay/Panel';
import * as videoTime from './overlay/useVideoTime';

const ROOT = join(__dirname, '../../tests/compat/fixtures');
const VERSIONS = readdirSync(ROOT).filter((d) => /^\d+\.\d+\.\d+$/.test(d));

type Fixtures = Record<'health' | 'analyze-submit' | 'job-pending' | 'job-done' | 'chart', any>;

function load(version: string, extra: Record<string, unknown> = {}): Fixtures {
  const read = (name: string) => JSON.parse(readFileSync(join(ROOT, version, `${name}.json`), 'utf8'));
  const names = ['health', 'analyze-submit', 'job-pending', 'job-done', 'chart'] as const;
  return Object.fromEntries(names.map((n) => [n, { ...read(n), ...extra }])) as Fixtures;
}

/** Serve one version's recorded responses for the extension's own URLs. */
function serve(fx: Fixtures, which: 'pending' | 'done' = 'done') {
  const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.endsWith('/health')) return json(fx.health);
      if (url.endsWith('/analyze')) return json(fx['analyze-submit']);
      if (url.includes('/analyze/')) return json(which === 'pending' ? fx['job-pending'] : fx['job-done']);
      if (url.includes('/chart/')) return json(fx.chart);
      throw new Error(`unexpected url ${url}`);
    }),
  );
}

beforeEach(() => {
  (chrome.storage.local as unknown as { _data: Record<string, unknown> })._data = {};
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('there are fixtures to test against', () => {
  expect(VERSIONS).toContain('0.5.1');
});

describe.each(VERSIONS)('helper %s', (version) => {
  test('is up and not too old', async () => {
    serve(load(version));
    expect(await getHelperStatus()).toEqual({ state: 'up', engineVersion: version });
    expect(await handleGetHelperStatus()).toMatchObject({ state: 'up', tooOld: false });
  });

  test('submit, poll and cached chart answer in the shapes the client reads', async () => {
    const fx = load(version);
    serve(fx, 'pending');
    expect(await submitAnalysis('dQw4w9WgXcQ')).toBe(fx['analyze-submit'].jobId);
    expect(await pollJobOnce('job')).toMatchObject({ status: 'pending' });
    serve(fx, 'done');
    expect(await pollJobOnce('job')).toMatchObject({ status: 'done', chart: { chords: expect.any(Array) } });
    expect(await fetchCachedChart('dQw4w9WgXcQ')).toMatchObject({ key: expect.anything(), tempo: expect.anything() });
  });

  test('the Panel renders its chart', () => {
    vi.spyOn(videoTime, 'useVideoTime').mockReturnValue({ time: 0, adShowing: false });
    render(<Panel chart={load(version).chart} onCollapse={() => {}} />);
    expect(screen.getAllByText(load(version).chart.chords[0].label).length).toBeGreaterThan(0);
  });

  test('unknown fields added by a newer helper are ignored', async () => {
    const fx = load(version, { futureField: { nested: 1 } });
    serve(fx);
    expect(await handleGetHelperStatus()).toMatchObject({ state: 'up', tooOld: false });
    vi.spyOn(videoTime, 'useVideoTime').mockReturnValue({ time: 0, adShowing: false });
    render(<Panel chart={fx.chart} onCollapse={() => {}} />);
    expect(screen.getAllByText(fx.chart.chords[0].label).length).toBeGreaterThan(0);
  });
});
