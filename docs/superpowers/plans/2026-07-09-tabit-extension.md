# tabIt Chrome Extension Implementation Plan (sub-project 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MV3 Chrome extension: a collapsed "♪ Get chords" bar injected below the YouTube player that, on click, fetches the chart from the existing tabIt API and expands into the synced paper chord sheet (highlight, lookahead, confidence dimming, transpose), following the page's `<video>` element.

**Architecture:** Four pieces per the spec — content script (inject + sync + SPA nav), overlay UI (React mounted in a Shadow DOM), service worker (API orchestration + session cache), manifest. The extension bundles with **esbuild** (two entries: `content.js` as IIFE, `background.js` as ESM) — no MV3 build plugins to break. Shared chart types and music helpers are **imported directly from `../web/src/lib`** (pure TS, no deps) so there is no copy drift. The panel is a port of the web app's `Sheet.tsx` with enumerated deltas.

**Tech Stack:** TypeScript, React 19 (bundled into the content script), esbuild, vitest + jsdom (with a minimal `chrome` stub), Playwright (final e2e, controller-driven).

## Global Constraints

- **Thin client:** the extension performs no analysis. All data comes from the existing API (`GET /chart/{videoId}`, `POST /analyze`, `GET /analyze/{jobId}`) via the service worker. API base: `http://localhost:8000` in a single constant (`API_BASE` in `src/background/api.ts`).
- **Shared code, no copies:** chart types and music helpers are imported from `../web/src/lib/types.ts` and `../web/src/lib/music.ts`. Do not duplicate them.
- **All UI lives in a Shadow DOM** (`mode: 'open'` for testability). No styles or DOM outside the shadow root except the host `<div id="tabit-root">`.
- **Content scripts never `fetch`** — all network in the service worker; content↔background via `chrome.runtime.sendMessage` with the message contract of Task 1.
- **Message polling model (SW-restart-safe):** the content script polls `{type:'GET_CHART', videoId}` every 3 s until `done`/`error`. The background handler is idempotent: session-cache hit → done; server chart-cache hit → done; pending job (jobId in `chrome.storage.session`) → poll once → pending/done; no job → submit → pending.
- **Manifest matches `*://www.youtube.com/*`** (not only `/watch*`): YouTube is an SPA — users land on the home page and navigate to watch pages without a page load, so the script must already be present. Watch-page behavior is gated in code. (Deliberate plan-level refinement of the spec, for this reason.)
- **Typography:** the extension uses the design's system-serif stack (`"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif`). Fraunces webfont is NOT loaded in v1 (`@font-face` inside a shadow root does not apply in Chrome; injecting fonts into YouTube's document is fragile). Documented trade-off.
- **Colors/styles:** copied from the web app's design values (`web/src/index.css`, `web/src/screens/Sheet.tsx` inline styles) — same oklch values, keyframes, and confidence threshold (< 0.75).
- **Extension package lives in `extension/`** with its own `package.json` (Node 20, npm). Tests colocate as `*.test.ts(x)` under `extension/src/`.
- Ads: while the player element (`#movie_player` or the video's ancestor `.html5-video-player`) has class `ad-showing`, sync pauses and the panel shows the ad state.

---

## File Structure

```
extension/
├── package.json  tsconfig.json  build.mjs        # esbuild bundler script
├── manifest.json
├── src/
│   ├── messages.ts            # message contract types (content ↔ background)
│   ├── background/
│   │   ├── api.ts             # API client (fetch chart / submit / poll) + API_BASE
│   │   ├── handler.ts         # idempotent GET_CHART orchestration + session cache
│   │   └── index.ts           # chrome.runtime.onMessage wiring
│   ├── content/
│   │   ├── page.ts            # watch-page detection, videoId from URL, ad detection, insertion point
│   │   ├── navigation.ts      # SPA navigation watcher (yt-navigate-finish + URL poll)
│   │   ├── mount.ts           # shadow-DOM host creation/teardown
│   │   └── index.ts           # orchestrates: watch nav → mount → render overlay
│   └── overlay/
│       ├── styles.ts          # css string injected into the shadow root
│       ├── useVideoTime.ts    # rAF poll of the page <video> (10 Hz, ad-aware)
│       ├── Bar.tsx            # collapsed bar + analyzing + error states
│       ├── Panel.tsx          # expanded sheet (port of web Sheet.tsx, deltas below)
│       └── App.tsx            # overlay state machine (collapsed→analyzing→sheet)
└── test-setup.ts              # chrome API stub for vitest
```

---

### Task 0: Extension scaffolding + build

Prove the toolchain: esbuild bundles two entries, the manifest is valid, vitest runs with a `chrome` stub, and TS resolves imports from `../web/src/lib`.

**Files:**
- Create: `extension/package.json`, `extension/tsconfig.json`, `extension/build.mjs`, `extension/manifest.json`, `extension/test-setup.ts`, `extension/src/messages.ts` (placeholder-free minimal version, extended in Task 1), `extension/src/background/index.ts` + `extension/src/content/index.ts` (minimal logging stubs)
- Test: `extension/src/smoke.test.ts`

**Interfaces:**
- Produces: `npm run build` → `dist/background.js` (ESM) + `dist/content.js` (IIFE) + `dist/manifest.json`; `npm test` runs vitest with `chrome` stubbed globally.

- [ ] **Step 1: `extension/package.json`**

```json
{
  "name": "tabit-extension",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "node build.mjs",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.280",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@testing-library/jest-dom": "^6.9.0",
    "@testing-library/react": "^16.3.0",
    "esbuild": "^0.24.0",
    "jsdom": "^28.0.0",
    "typescript": "~5.9.0",
    "vitest": "^4.0.0"
  }
}
```

Run `cd extension && npm install` (versions may float minor; pin whatever resolves).

- [ ] **Step 2: `extension/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "skipLibCheck": true,
    "types": ["chrome", "vitest/globals", "@testing-library/jest-dom"],
    "noEmit": true
  },
  "include": ["src", "test-setup.ts", "../web/src/lib/types.ts", "../web/src/lib/music.ts"]
}
```

- [ ] **Step 3: `extension/build.mjs`**

```js
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
  logLevel: 'info',
});

await build({
  entryPoints: ['src/background/index.ts'],
  bundle: true,
  format: 'esm',             // MV3 module service worker
  outfile: 'dist/background.js',
  logLevel: 'info',
});

cpSync('manifest.json', 'dist/manifest.json');
console.log('built dist/');
```

- [ ] **Step 4: `extension/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "tabIt — chords for YouTube",
  "version": "0.1.0",
  "description": "Play along: chords, key and scales for the song you're watching.",
  "permissions": ["storage"],
  "host_permissions": ["http://localhost:8000/*"],
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [
    {
      "matches": ["*://www.youtube.com/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 5: stubs, chrome test stub, smoke test**

`extension/src/messages.ts`:
```ts
export interface GetChartRequest { type: 'GET_CHART'; videoId: string; }
```

`extension/src/background/index.ts`:
```ts
console.log('[tabit] background alive');
```

`extension/src/content/index.ts`:
```ts
console.log('[tabit] content alive');
```

`extension/test-setup.ts`:
```ts
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
```

Add vitest config to `package.json` (or `vitest.config.ts`):
```ts
// extension/vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'jsdom', globals: true, setupFiles: './test-setup.ts' },
  esbuild: { jsx: 'automatic' },
});
```

`extension/src/smoke.test.ts`:
```ts
import { QUALITY_SUFFIX, transposeRoot } from '../../web/src/lib/music';

test('shared lib resolves across packages', () => {
  expect(QUALITY_SUFFIX.min7).toBe('m7');
  expect(transposeRoot('G#', 1)).toBe('A');
});

test('chrome stub present', () => {
  expect((globalThis as Record<string, unknown>).chrome).toBeDefined();
});
```

- [ ] **Step 6: Verify** — `cd extension && npm run build` (dist/ has content.js, background.js, manifest.json), `npm test` (2 pass), `npm run typecheck` clean. Optionally verify the unpacked build loads: `dist/` is a loadable unpacked extension (manual check deferred to Task 7's e2e).

- [ ] **Step 7: Commit** — `git add extension && git commit -m "chore(ext): scaffold MV3 extension with esbuild + shared-lib imports"`. (Root `.gitignore` already covers `node_modules/` and `dist/`.)

---

### Task 1: Message contract + page utilities

**Files:**
- Modify: `extension/src/messages.ts`
- Create: `extension/src/content/page.ts`
- Test: `extension/src/content/page.test.ts`, `extension/src/messages.test.ts`

**Interfaces:**
- Produces:
  - `messages.ts`: `GetChartRequest {type:'GET_CHART', videoId}`; `GetChartResponse = {status:'done', chart: Chart} | {status:'pending'} | {status:'error', error: string}` (Chart imported from `../../web/src/lib/types`).
  - `page.ts`: `watchVideoId(loc: {pathname, search}) -> string | null` (null off watch pages or bad ids — reuses the 11-char rule); `isAdShowing(root: ParentNode) -> boolean` (`.ad-showing` on the player element); `findInsertionSlot(root: ParentNode) -> Element | null` trying `INSERTION_SELECTORS` in order (`['#below', 'ytd-watch-metadata', '#primary-inner']` — one exported constant).

- [ ] **Step 1: Write failing tests**

`extension/src/content/page.test.ts`:
```ts
import { watchVideoId, isAdShowing, findInsertionSlot, INSERTION_SELECTORS } from './page';

describe('watchVideoId', () => {
  test('watch page with v param', () => {
    expect(watchVideoId({ pathname: '/watch', search: '?v=dQw4w9WgXcQ' })).toBe('dQw4w9WgXcQ');
  });
  test('extra params', () => {
    expect(watchVideoId({ pathname: '/watch', search: '?v=dQw4w9WgXcQ&t=42s' })).toBe('dQw4w9WgXcQ');
  });
  test('non-watch pages -> null', () => {
    expect(watchVideoId({ pathname: '/', search: '' })).toBeNull();
    expect(watchVideoId({ pathname: '/feed/subscriptions', search: '' })).toBeNull();
  });
  test('malformed id -> null', () => {
    expect(watchVideoId({ pathname: '/watch', search: '?v=short' })).toBeNull();
  });
});

describe('isAdShowing', () => {
  test('detects ad-showing class', () => {
    document.body.innerHTML = '<div class="html5-video-player ad-showing"></div>';
    expect(isAdShowing(document)).toBe(true);
    document.body.innerHTML = '<div class="html5-video-player"></div>';
    expect(isAdShowing(document)).toBe(false);
  });
});

describe('findInsertionSlot', () => {
  test('prefers earlier selectors', () => {
    document.body.innerHTML = '<div id="primary-inner"><div id="below"></div></div>';
    expect(findInsertionSlot(document)?.id).toBe('below');
  });
  test('falls back down the list', () => {
    document.body.innerHTML = '<div id="primary-inner"></div>';
    expect(findInsertionSlot(document)?.id).toBe('primary-inner');
  });
  test('null when nothing matches', () => {
    document.body.innerHTML = '<main></main>';
    expect(findInsertionSlot(document)).toBeNull();
  });
  test('selector list is the documented constant', () => {
    expect(INSERTION_SELECTORS[0]).toBe('#below');
  });
});
```

- [ ] **Step 2: RED** — `npm test` fails (module missing).

- [ ] **Step 3: Implement**

`extension/src/messages.ts`:
```ts
import type { Chart } from '../../web/src/lib/types';

export interface GetChartRequest { type: 'GET_CHART'; videoId: string; }

export type GetChartResponse =
  | { status: 'done'; chart: Chart }
  | { status: 'pending' }
  | { status: 'error'; error: string };
```

`extension/src/content/page.ts`:
```ts
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Ordered insertion candidates for the below-player slot. First match wins.
 *  This list is the single point of maintenance when YouTube's DOM changes. */
export const INSERTION_SELECTORS = ['#below', 'ytd-watch-metadata', '#primary-inner'];

export function watchVideoId(loc: { pathname: string; search: string }): string | null {
  if (loc.pathname !== '/watch') return null;
  const v = new URLSearchParams(loc.search).get('v');
  return v && VIDEO_ID.test(v) ? v : null;
}

export function isAdShowing(root: ParentNode): boolean {
  return root.querySelector('.html5-video-player.ad-showing') !== null;
}

export function findInsertionSlot(root: ParentNode): Element | null {
  for (const sel of INSERTION_SELECTORS) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}
```

Add a type-only test `extension/src/messages.test.ts`:
```ts
import type { GetChartResponse } from './messages';

test('message contract shapes compile', () => {
  const done: GetChartResponse = {
    status: 'done',
    chart: {
      schemaVersion: 1,
      source: { kind: 'youtube', videoId: 'x', duration: 1 },
      analysis: { engineVersion: '0.1.0', createdAt: 'now' },
      key: { tonic: 'A', mode: 'major', confidence: 1 },
      scales: [], tempo: { bpm: 120 }, beats: [], sections: [], chords: [],
    },
  };
  const pending: GetChartResponse = { status: 'pending' };
  const error: GetChartResponse = { status: 'error', error: 'x' };
  expect([done.status, pending.status, error.status]).toEqual(['done', 'pending', 'error']);
});
```

- [ ] **Step 4: GREEN** — `npm test` all pass; `npm run typecheck` clean.

- [ ] **Step 5: Commit** — `git add extension/src && git commit -m "feat(ext): message contract and watch-page utilities"`.

---

### Task 2: Service worker — API client + idempotent handler

**Files:**
- Create: `extension/src/background/api.ts`, `extension/src/background/handler.ts`
- Modify: `extension/src/background/index.ts`
- Test: `extension/src/background/handler.test.ts`

**Interfaces:**
- Produces:
  - `api.ts`: `API_BASE = 'http://localhost:8000'`; `fetchCachedChart(videoId) -> Chart | null` (GET /chart, 404→null); `submitAnalysis(videoId) -> string` (POST /analyze with `{url: 'https://www.youtube.com/watch?v='+videoId}` → jobId); `pollJobOnce(jobId) -> {status:'pending'} | {status:'done', chart} | {status:'error', error}` (single GET, no loop).
  - `handler.ts`: `handleGetChart(videoId) -> Promise<GetChartResponse>` — idempotent per the Global Constraints polling model, with `chrome.storage.session` keys `chart:<videoId>` and `job:<videoId>`.
  - `index.ts`: `chrome.runtime.onMessage.addListener` dispatching `GET_CHART` → `handleGetChart`, `sendResponse` async (`return true`).

- [ ] **Step 1: Write failing tests `extension/src/background/handler.test.ts`** (mock the `api` module with `vi.mock`; use the test-setup session-storage stub):

```ts
import { vi, type Mock } from 'vitest';
import { handleGetChart } from './handler';
import * as api from './api';

vi.mock('./api', () => ({
  fetchCachedChart: vi.fn(),
  submitAnalysis: vi.fn(),
  pollJobOnce: vi.fn(),
}));

const CHART = { schemaVersion: 1 } as never;

beforeEach(async () => {
  vi.clearAllMocks();
  // reset the session stub between tests
  (chrome.storage.session as unknown as { _data: Record<string, unknown> })._data = {};
});

test('session-cached chart returns done without network', async () => {
  await chrome.storage.session.set({ 'chart:vid00000001': CHART });
  const res = await handleGetChart('vid00000001');
  expect(res).toEqual({ status: 'done', chart: CHART });
  expect(api.fetchCachedChart).not.toHaveBeenCalled();
});

test('server cache hit stores and returns done', async () => {
  (api.fetchCachedChart as Mock).mockResolvedValue(CHART);
  const res = await handleGetChart('vid00000001');
  expect(res.status).toBe('done');
  const stored = await chrome.storage.session.get('chart:vid00000001');
  expect(stored['chart:vid00000001']).toEqual(CHART);
});

test('cache miss submits a job and reports pending', async () => {
  (api.fetchCachedChart as Mock).mockResolvedValue(null);
  (api.submitAnalysis as Mock).mockResolvedValue('job-1');
  const res = await handleGetChart('vid00000001');
  expect(res).toEqual({ status: 'pending' });
  const stored = await chrome.storage.session.get('job:vid00000001');
  expect(stored['job:vid00000001']).toBe('job-1');
});

test('existing job is polled once; done resolves and clears the job', async () => {
  await chrome.storage.session.set({ 'job:vid00000001': 'job-1' });
  (api.pollJobOnce as Mock).mockResolvedValue({ status: 'done', chart: CHART });
  const res = await handleGetChart('vid00000001');
  expect(res.status).toBe('done');
  expect(api.submitAnalysis).not.toHaveBeenCalled();
});

test('job error surfaces and clears the job for retry', async () => {
  await chrome.storage.session.set({ 'job:vid00000001': 'job-1' });
  (api.pollJobOnce as Mock).mockResolvedValue({ status: 'error', error: 'boom' });
  const res = await handleGetChart('vid00000001');
  expect(res).toEqual({ status: 'error', error: 'boom' });
  const stored = await chrome.storage.session.get('job:vid00000001');
  expect(stored['job:vid00000001']).toBeUndefined();
});

test('API unreachable -> error response, not a throw', async () => {
  (api.fetchCachedChart as Mock).mockRejectedValue(new TypeError('fetch failed'));
  const res = await handleGetChart('vid00000001');
  expect(res.status).toBe('error');
});
```

- [ ] **Step 2: RED.**

- [ ] **Step 3: Implement**

`extension/src/background/api.ts`:
```ts
import type { Chart } from '../../../web/src/lib/types';

export const API_BASE = 'http://localhost:8000';

export async function fetchCachedChart(videoId: string): Promise<Chart | null> {
  const res = await fetch(`${API_BASE}/chart/${videoId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function submitAnalysis(videoId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${videoId}` }),
  });
  if (!res.ok && res.status !== 202) throw new Error(`API ${res.status}`);
  return (await res.json()).jobId;
}

export async function pollJobOnce(jobId: string) {
  const res = await fetch(`${API_BASE}/analyze/${jobId}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<
    { status: 'pending' } | { status: 'done'; chart: Chart } | { status: 'error'; error: string }
  >;
}
```

`extension/src/background/handler.ts`:
```ts
import type { GetChartResponse } from '../messages';
import { fetchCachedChart, pollJobOnce, submitAnalysis } from './api';

async function sessionGet<T>(key: string): Promise<T | undefined> {
  const out = await chrome.storage.session.get(key);
  return out[key] as T | undefined;
}

/** Idempotent: safe to call every 3s from the content script; survives SW restarts
 *  because all state (chart, jobId) lives in chrome.storage.session. */
export async function handleGetChart(videoId: string): Promise<GetChartResponse> {
  try {
    const cached = await sessionGet<GetChartResponse['status'] extends never ? never : never>(`chart:${videoId}`) as never;
    if (cached) return { status: 'done', chart: cached };

    const jobId = await sessionGet<string>(`job:${videoId}`);
    if (jobId) {
      const state = await pollJobOnce(jobId);
      if (state.status === 'done') {
        await chrome.storage.session.set({ [`chart:${videoId}`]: state.chart });
        await chrome.storage.session.remove?.(`job:${videoId}`);
        return { status: 'done', chart: state.chart };
      }
      if (state.status === 'error') {
        await chrome.storage.session.remove?.(`job:${videoId}`);
        return { status: 'error', error: state.error };
      }
      return { status: 'pending' };
    }

    const chart = await fetchCachedChart(videoId);
    if (chart) {
      await chrome.storage.session.set({ [`chart:${videoId}`]: chart });
      return { status: 'done', chart };
    }

    const newJob = await submitAnalysis(videoId);
    await chrome.storage.session.set({ [`job:${videoId}`]: newJob });
    return { status: 'pending' };
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}
```

(Clean up the `cached` typing to a plain `Chart | undefined` — the snippet above marks where; write it properly: `const cached = await sessionGet<Chart>(...)`. If `chrome.storage.session.remove` is absent in the test stub, add it to `test-setup.ts` mirroring `set`.)

`extension/src/background/index.ts`:
```ts
import type { GetChartRequest } from '../messages';
import { handleGetChart } from './handler';

chrome.runtime.onMessage.addListener((msg: GetChartRequest, _sender, sendResponse) => {
  if (msg?.type === 'GET_CHART') {
    handleGetChart(msg.videoId).then(sendResponse);
    return true; // async response
  }
  return false;
});
```

- [ ] **Step 4: GREEN** — `npm test` all pass; `npm run typecheck` clean; `npm run build` still succeeds.

- [ ] **Step 5: Commit** — `git add extension/src extension/test-setup.ts && git commit -m "feat(ext): service worker API orchestration with session cache"`.

---

### Task 3: Content-script shell — navigation, mount, teardown

**Files:**
- Create: `extension/src/content/navigation.ts`, `extension/src/content/mount.ts`
- Modify: `extension/src/content/index.ts`
- Test: `extension/src/content/navigation.test.ts`, `extension/src/content/mount.test.ts`

**Interfaces:**
- Produces:
  - `navigation.ts`: `watchNavigation(onVideo: (videoId: string | null) => void) -> () => void` — fires immediately with the current state, then on `yt-navigate-finish` (document event) AND a 1 s URL-poll fallback; dedupes consecutive identical videoIds; returns a stop function.
  - `mount.ts`: `mountOverlay(slot: Element) -> {shadowRoot: ShadowRoot, unmount: () => void}` — prepends a `<div id="tabit-root">` into the slot, attaches an open shadow root, injects `<style>` (from `overlay/styles.ts`, Task 4); `unmount` removes the host node.
  - `index.ts`: glue — `watchNavigation` → on videoId: `findInsertionSlot` (retry via MutationObserver for up to 10 s if null) → `mountOverlay` → render the overlay App (Task 4/5) with `{videoId}`; on null/changed videoId: unmount previous.

- [ ] **Step 1: Write failing tests**

`extension/src/content/navigation.test.ts`:
```ts
import { vi } from 'vitest';
import { watchNavigation } from './navigation';

test('fires immediately and on yt-navigate-finish, dedupes', () => {
  vi.useFakeTimers();
  history.pushState({}, '', '/watch?v=aaaaaaaaaaa');
  const seen: (string | null)[] = [];
  const stop = watchNavigation((v) => seen.push(v));
  expect(seen).toEqual(['aaaaaaaaaaa']);

  document.dispatchEvent(new Event('yt-navigate-finish'));       // same id -> dedupe
  expect(seen).toEqual(['aaaaaaaaaaa']);

  history.pushState({}, '', '/watch?v=bbbbbbbbbbb');
  document.dispatchEvent(new Event('yt-navigate-finish'));
  expect(seen).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);

  history.pushState({}, '', '/feed/library');
  vi.advanceTimersByTime(1100);                                    // URL-poll fallback
  expect(seen).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', null]);

  stop();
  history.pushState({}, '', '/watch?v=ccccccccccc');
  vi.advanceTimersByTime(2000);
  expect(seen.length).toBe(3);                                     // stopped
  vi.useRealTimers();
});
```

`extension/src/content/mount.test.ts`:
```ts
import { mountOverlay } from './mount';

test('mounts a shadow host into the slot and unmounts cleanly', () => {
  document.body.innerHTML = '<div id="below"></div>';
  const slot = document.getElementById('below')!;
  const { shadowRoot, unmount } = mountOverlay(slot);
  expect(document.getElementById('tabit-root')).not.toBeNull();
  expect(shadowRoot.querySelector('style')).not.toBeNull();
  unmount();
  expect(document.getElementById('tabit-root')).toBeNull();
});
```

- [ ] **Step 2: RED.**

- [ ] **Step 3: Implement**

`extension/src/content/navigation.ts`:
```ts
import { watchVideoId } from './page';

/** Watches YouTube SPA navigation. Calls onVideo with the current watch videoId
 *  (or null off watch pages), immediately and on every navigation. Dedupes. */
export function watchNavigation(onVideo: (videoId: string | null) => void): () => void {
  let last: string | null | undefined;

  const check = () => {
    const id = watchVideoId(window.location);
    if (id !== last) {
      last = id;
      onVideo(id);
    }
  };

  check();
  document.addEventListener('yt-navigate-finish', check);
  const poll = setInterval(check, 1000); // fallback: yt-navigate-finish is undocumented

  return () => {
    document.removeEventListener('yt-navigate-finish', check);
    clearInterval(poll);
  };
}
```

`extension/src/content/mount.ts`:
```ts
import { OVERLAY_CSS } from '../overlay/styles';

export function mountOverlay(slot: Element): { shadowRoot: ShadowRoot; unmount: () => void } {
  const host = document.createElement('div');
  host.id = 'tabit-root';
  slot.prepend(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = OVERLAY_CSS;
  shadowRoot.appendChild(style);
  return { shadowRoot, unmount: () => host.remove() };
}
```

(For this task, create `extension/src/overlay/styles.ts` with a minimal `export const OVERLAY_CSS = ':host { all: initial; }';` — Task 4 fills it in.)

`extension/src/content/index.ts` — glue with slot-retry:
```ts
import { findInsertionSlot } from './page';
import { watchNavigation } from './navigation';
import { mountOverlay } from './mount';
import { renderOverlay } from '../overlay/App';   // Task 4 provides; stub until then

let current: { unmount: () => void } | null = null;

function teardown() {
  current?.unmount();
  current = null;
}

function mountFor(videoId: string) {
  const tryMount = (slot: Element) => {
    const { shadowRoot, unmount } = mountOverlay(slot);
    const stopApp = renderOverlay(shadowRoot, videoId);
    current = { unmount: () => { stopApp(); unmount(); } };
  };

  const slot = findInsertionSlot(document);
  if (slot) return tryMount(slot);

  // Slot not in the DOM yet (fresh navigation): observe until it appears (max 10s).
  const obs = new MutationObserver(() => {
    const found = findInsertionSlot(document);
    if (found) { obs.disconnect(); clearTimeout(timer); tryMount(found); }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  const timer = setTimeout(() => obs.disconnect(), 10_000);
}

watchNavigation((videoId) => {
  teardown();
  if (videoId) mountFor(videoId);
});
```

For this task, `renderOverlay` is a stub in `extension/src/overlay/App.tsx`:
```tsx
export function renderOverlay(_shadowRoot: ShadowRoot, _videoId: string): () => void {
  return () => {};
}
```

- [ ] **Step 4: GREEN** — `npm test`, `npm run typecheck`, `npm run build` all pass.

- [ ] **Step 5: Commit** — `git add extension/src && git commit -m "feat(ext): SPA navigation watcher and shadow-DOM mount lifecycle"`.

---

### Task 4: Overlay state machine — bar, analyzing, error + video time hook

**Files:**
- Create: `extension/src/overlay/Bar.tsx`, `extension/src/overlay/useVideoTime.ts`
- Modify: `extension/src/overlay/App.tsx`, `extension/src/overlay/styles.ts`
- Test: `extension/src/overlay/App.test.tsx`

**Interfaces:**
- Produces:
  - `renderOverlay(shadowRoot, videoId) -> stop()` — real implementation: creates a `<div>` in the shadow root, `ReactDOM.createRoot`, renders `<App videoId=.../>`, stop() unmounts the React root.
  - `App` state machine: `collapsed` → (click "Get chords") → `loading` (polls `GET_CHART` via `chrome.runtime.sendMessage` every 3 s) → `sheet` (chart held in state) | `error` (message + Retry resets to loading). Session-cached charts resolve on the first poll → effectively instant.
  - `Bar.tsx`: the collapsed bar (wordmark + "♪ Get chords"), `loading` variant (sweep + "first listen takes a minute or two — after that it's instant"), `error` variant (message + retry). Styles per the web app's design values, system-serif stack.
  - `useVideoTime.ts`: `useVideoTime(active: boolean) -> {time: number, adShowing: boolean}` — rAF loop at ~10 Hz reading `document.querySelector('video')` and `isAdShowing(document)`; no-ops when `active` is false.

- [ ] **Step 1: Write failing tests `extension/src/overlay/App.test.tsx`** (mock `chrome.runtime.sendMessage`; render `App` directly with testing-library; fake timers for the 3 s poll):

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, type Mock } from 'vitest';
import { App } from './App';

const CHART = {
  schemaVersion: 1,
  source: { kind: 'youtube', videoId: 'vid00000001', title: 'T', duration: 10 },
  analysis: { engineVersion: '0.1.0', createdAt: 'now' },
  key: { tonic: 'A', mode: 'major', confidence: 0.9 },
  scales: [{ name: 'A major pentatonic', notes: [] }],
  tempo: { bpm: 120 }, beats: [], sections: [],
  chords: [{ start: 0, end: 5, label: 'A', root: 'A', quality: 'maj', bass: 'A', confidence: 0.9 }],
};

beforeEach(() => {
  (chrome.runtime as { sendMessage: unknown }).sendMessage = vi.fn();
});

test('collapsed bar -> click -> done chart renders sheet', async () => {
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ status: 'done', chart: CHART });
  render(<App videoId="vid00000001" />);
  await userEvent.click(screen.getByRole('button', { name: /get chords/i }));
  await waitFor(() => expect(screen.getByText(/A major pentatonic/)).toBeInTheDocument());
});

test('error response shows retry', async () => {
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ status: 'error', error: 'server unreachable' });
  render(<App videoId="vid00000001" />);
  await userEvent.click(screen.getByRole('button', { name: /get chords/i }));
  await waitFor(() => expect(screen.getByText(/server unreachable/)).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
});

test('pending keeps polling until done', async () => {
  vi.useFakeTimers();
  const send = chrome.runtime.sendMessage as Mock;
  send.mockResolvedValueOnce({ status: 'pending' }).mockResolvedValueOnce({ status: 'done', chart: CHART });
  render(<App videoId="vid00000001" />);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.click(screen.getByRole('button', { name: /get chords/i }));
  await vi.advanceTimersByTimeAsync(3100);
  await waitFor(() => expect(screen.getByText(/A major pentatonic/)).toBeInTheDocument());
  expect(send).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});
```

(The sheet itself is Task 5 — for THIS task, App renders a placeholder sheet div showing `chart.scales[0].name`, exactly like the web app's Task 7 did. Task 5 swaps in the real Panel.)

- [ ] **Step 2: RED.**

- [ ] **Step 3: Implement** `App.tsx` (state machine + `renderOverlay` with `createRoot`), `Bar.tsx` (three variants, styles via classNames defined in `styles.ts`), `useVideoTime.ts` (port of `web/src/playback/usePlaybackTime.ts` reading the DOM `<video>` + `isAdShowing`), and fill `styles.ts` with the shared css string: paper tokens (oklch values from `web/src/index.css`), bar/panel classes, keyframes (`tabit-sweep`, `tabit-fade-in`), reduced-motion guard, `:host { all: initial; }` isolation.

- [ ] **Step 4: GREEN** — `npm test`, `npm run typecheck`, `npm run build`.

- [ ] **Step 5: Commit** — `git add extension/src && git commit -m "feat(ext): overlay state machine with bar, analyzing and error states"`.

---

### Task 5: The panel — synced sheet in the shadow root

**Files:**
- Create: `extension/src/overlay/Panel.tsx`
- Modify: `extension/src/overlay/App.tsx` (replace placeholder), `extension/src/overlay/styles.ts`
- Test: `extension/src/overlay/Panel.test.tsx`

**Interfaces:**
- Consumes: `Chart` + `music.ts` helpers (shared lib), `useVideoTime` (Task 4).
- Produces: `<Panel chart={chart} onCollapse={() => void} />` — the paper sheet.

**Port source:** `web/src/screens/Sheet.tsx` is the in-repo source of truth for layout, style values, and decoration logic. Port it with these EXACT deltas:
1. **No player column, no mediaFile, no YouTubePlayer/AudioPlayer** — time comes from `useVideoTime(true)` (the page's own video is the player).
2. **No editing** (no EditPopover, no overrides, chords are non-interactive spans; keep the `data-testid="marker"` on the current-chord highlight).
3. **Header:** tabIt wordmark + key/tempo/scales chips + transpose −/+ (same logic incl. `transposeScaleName`) + a collapse control (`▴`) calling `onCollapse`. No "‹ new song", no video title (the page shows it).
4. **Ad state:** when `useVideoTime` reports `adShowing`, dim the sheet (opacity 0.5) and show a small "ad playing…" tag; sync resumes automatically.
5. **Same everything else:** rows of 4, ruled lines, red margin, amber marker (rotate −0.6deg, radius 3px 8px 5px 9px), 30px/26px chord sizes (serif stack), next-chord 2px underline, <0.75 dotted dimming, N as muted '—', auto-scroll (max-height 420px, centered when drift >8px), Now/Next footer with empty-chords guard.
6. Styles go into `styles.ts` css string as classes (shadow DOM has no page CSS; do NOT use inline-style objects for anything that needs hover/pseudo states).

- [ ] **Step 1: Write failing tests `extension/src/overlay/Panel.test.tsx`** — mirror `web/src/screens/Sheet.test.tsx`'s fixture and assertions, adapted: mock `useVideoTime` (vi.mock) to control time/adShowing; assert (a) labels render + N as '—'; (b) marker on the current chord + footer Now; (c) transpose relabels chords AND the scales chip; (d) `adShowing: true` shows the ad tag; (e) collapse button calls `onCollapse`.

- [ ] **Step 2: RED.**

- [ ] **Step 3: Implement the port per the deltas. GREEN** — `npm test`, `npm run typecheck`, `npm run build`.

- [ ] **Step 4: Wire into `App.tsx`** (replace the placeholder; `sheet` state renders `<Panel chart onCollapse={back to collapsed}/>`); update `App.test.tsx`'s first test to assert a chord label from the real panel (e.g. the marker testid) still passes.

- [ ] **Step 5: Commit** — `git add extension/src && git commit -m "feat(ext): synced paper panel ported from the web app sheet"`.

---

### Task 6: Bundle polish + degraded fallback

**Files:**
- Modify: `extension/src/content/index.ts`, `extension/src/overlay/styles.ts`
- Test: extend `extension/src/content/mount.test.ts`

**Work:**
1. **Degraded fallback (spec §4):** if no insertion slot is found within the 10 s observer window, mount the host `position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999` (a `fallback` argument to `mountOverlay` toggling a class). Test: with a DOM containing none of the selectors, after the timeout the host exists with the fallback class.
2. **Live-stream guard:** in `mountFor`, skip mounting when the page reports a live stream: `document.querySelector('.ytp-live') !== null` at mount time — best-effort heuristic, verified in e2e. (Unit test with fixture DOM.)
3. Build size sanity: `npm run build` and record `dist/content.js` size in the report (React bundle expected ~150-200 KB minified — fine for a local demo; note it).

- [ ] Steps: failing tests → RED → implement → GREEN → `git add extension && git commit -m "feat(ext): degraded mount fallback and live-stream guard"`.

---

### Task 7: End-to-end verification + docs

**Files:**
- Modify: `README.md`
- No new code except fixes surfaced.

- [ ] **Step 1: Full sweep** — root: `pytest -q`; `web/`: `npm test`, `npx tsc -b --noEmit`; `extension/`: `npm test`, `npm run typecheck`, `npm run build`.

- [ ] **Step 2: Live e2e (controller-driven, headful Playwright):** start the API (`uvicorn api.main:app --port 8000`), then launch Chromium with the unpacked extension:
  - `chromium.launchPersistentContext(userDataDir, { headless: false, args: ['--disable-extensions-except=<abs>/extension/dist', '--load-extension=<abs>/extension/dist'] })`
  - Navigate to `https://www.youtube.com/watch?v=HNBCVM4KbUM` (cache-warm from sub-project 2).
  - Verify: the collapsed bar appears below the player → click "Get chords" → sheet renders near-instantly (server cache) → the amber marker tracks playback as the video plays → transpose relabels → collapse works → SPA-navigate to another video (click a suggestion) → old panel tears down, fresh bar appears → navigate back → session-cached chart appears instantly.
  - Record screenshots + observations. If YouTube shows a consent/login interstitial in the fresh profile, dismiss it manually/scriptedly and note it.

- [ ] **Step 3: README** — mark sub-project 3 complete; add:

```markdown
### Run the extension (local)

    # 1. API running (terminal 1)
    source .venv/bin/activate && uvicorn api.main:app --port 8000

    # 2. build the extension
    cd extension && npm install && npm run build

    # 3. chrome://extensions → Developer mode → Load unpacked → select extension/dist
    # 4. open a YouTube video → "♪ Get chords" appears below the player
```

- [ ] **Step 4: Commit** — `git add README.md && git commit -m "docs: extension run instructions and progress"`.

---

## Self-Review

**Spec coverage:** collapsed-bar activation (T4), Option-A injection + Shadow DOM (T3), playback sync + ad pause (T4/T5), SPA navigation + teardown (T3), service-worker API + session cache + SW-restart-safe polling (T2), insertion fallbacks + degraded mount + live-stream guard (T1/T6), transpose incl. scales (T5), error/retry (T4), minimal permissions manifest (T0), e2e + docs (T7). Deferred items (editing, strip mode, sidePanel, options page) correctly absent. ✅

**Placeholder scan:** all infra tasks carry complete code; UI port tasks (T4 Step 3, T5) bind to in-repo sources (`web/src/screens/Sheet.tsx`, `web/src/index.css`, `web/src/playback/usePlaybackTime.ts`) with enumerated deltas — the same source-binding pattern the web-app plan used successfully. One deliberate cleanup marker in T2 Step 3 (the `cached` typing) is resolved in the same step's text. ✅

**Type consistency:** `GetChartRequest/Response` (T1) used by handler (T2), content glue (T3), and App polling (T4); `renderOverlay(shadowRoot, videoId) -> stop()` consistent T3→T4; `useVideoTime(active) -> {time, adShowing}` consistent T4→T5; shared `Chart`/`music` imports use the same relative path depth per file location. ✅

**Known risks:** `chrome.storage.session` stub fidelity in vitest (kept minimal; handler tests are the contract); React-in-content-script bundle size (recorded in T6); YouTube consent interstitial in the fresh e2e profile (handled in T7); `yt-navigate-finish` is undocumented (URL-poll fallback is the safety net, T3).
