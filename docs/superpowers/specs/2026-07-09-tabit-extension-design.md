# tabIt Chrome Extension — Design Spec (sub-project 3)

**Date:** 2026-07-09
**Status:** Approved (brainstorming complete; ready for implementation planning)
**Depends on:** the merged MIR engine (sub-project 1) and web app / API (sub-project 2). The
extension is a thin client over the same API and reuses the web app's rendering logic.

---

## 1. Summary

A Manifest V3 Chrome extension that puts the tabIt chord sheet directly on YouTube watch
pages. A slim, unobtrusive **"♪ Get chords" bar** appears below the player; clicking it
requests analysis from the existing tabIt API (instant for cached songs) and expands into
the full paper-notebook panel — the synced bar grid with the amber current-chord highlighter,
next-chord lookahead, confidence dimming, key/tempo/scales chips, and transpose — following
the video as it plays.

**Placement decision (Option A):** panel injected into the page flow **below the player**,
above the video title. Full sheet without covering the video; the most native-feeling and the
most feasible of the injected options. (Alternatives considered: a compact strip pinned to the
player (v2 candidate mode) and a sidebar drawer (rejected: fights YouTube's most volatile DOM).)

**Activation decision:** collapsed bar → click to analyze & expand. No automatic analysis of
every watched video (wasteful), no toolbar-only activation (undiscoverable).

---

## 2. Architecture

Four small components; all heavy lifting stays server-side.

```
┌───────────────────────────── youtube.com/watch ─────────────────────────────┐
│  <video> element ◀── content script reads currentTime (rAF loop)             │
│       │                        │                                             │
│       │              [Shadow DOM container injected below player]            │
│       │                 collapsed bar ──click──▶ expanded paper panel        │
│       │                        ▲ chart JSON                                  │
└───────┼────────────────────────┼─────────────────────────────────────────────┘
        │              chrome.runtime messaging
        │                        │
                    [service worker] ──▶ tabIt API (host_permissions, no CORS)
                    chrome.storage.session cache (videoId → chart)
```

### 2.1 Content script (`content/`)

- Runs on `*://www.youtube.com/watch*`.
- **Insertion point:** primary selector for the below-player slot (e.g. `#below` /
  `ytd-watch-metadata` parent), with an ordered list of fallback selectors and a
  `MutationObserver` that waits for the slot to exist. This is the one acknowledged
  maintenance cost of injected UI; selectors live in one constant for easy patching.
- **Shadow DOM:** the container attaches a shadow root; all panel styles live inside it.
  YouTube's CSS cannot affect the panel; ours cannot leak out.
- **Playback sync:** `document.querySelector('video')` → poll `currentTime` on a
  requestAnimationFrame loop throttled to ~10 Hz (the proven web-app pattern), binary-search
  the chart's chord segments, update highlight/lookahead.
- **Ad handling:** while the player element carries the `ad-showing` class, sync pauses and
  the panel shows a quiet "ad playing…" state; resumes automatically.
- **SPA navigation:** listen for `yt-navigate-finish` (plus a URL-poll fallback), dedupe by
  videoId, tear down listeners/UI per navigation (AbortController), re-acquire the `<video>`
  element (it can be replaced), and account for YouTube's metadata lag after navigation.
- Never `fetch()` from the content script (page CORS applies) — all network goes through the
  service worker via `chrome.runtime.sendMessage`.

### 2.2 Overlay UI (rendered in the shadow root)

- **Collapsed bar:** one slim row, tabIt wordmark + "♪ Get chords". Hidden for live streams.
- **Expanded panel:** the paper sheet, visually per the approved web-app design (DESIGN.md):
  warm paper on YouTube's page (deliberately paper in both YouTube themes), red margin line,
  Fraunces-style serif chords (font loaded inside the shadow root), bar grid rows, amber
  highlighter on the current chord, 2px underline on the next, dotted-dim for confidence
  < 0.75, chips for key/tempo/scales, transpose −/+ (±6, recomputed via the shared music
  helpers), collapse control.
- **States:** collapsed → analyzing (sweep animation + "first listen takes a minute or two")
  → sheet; error state with retry; ad-paused state.
- **Rendering logic is ported/shared from the web app** — chart types, `music.ts`
  (transposeRoot/formatLabel/findCurrentIndex/transposeScaleName) are reused verbatim; the
  Sheet layout is adapted to the panel (the build tooling decision — share via a common
  package vs. copy-with-provenance — is made in the implementation plan).

### 2.3 Service worker (`background/`)

- Owns all API calls: `POST /analyze {url}` → poll `GET /analyze/{jobId}` → chart JSON;
  fast path `GET /chart/{videoId}` first.
- API host in `host_permissions` → extension-privileged fetch, no CORS issues.
- Message contract with the content script: `{type: 'GET_CHART', videoId}` →
  `{status: 'cached'|'pending'|'done'|'error', chart?, error?}` with progress pushes.
- `chrome.storage.session` cache (videoId → chart) so re-navigations within a browser session
  render instantly without any network.
- API base URL configurable (constant for the demo; localhost:8000 by default).

### 2.4 Manifest (MV3)

- `content_scripts`: `*://www.youtube.com/watch*`.
- `host_permissions`: the tabIt API origin only.
- `permissions`: `storage`. Nothing else — no tabs, no tabCapture, no offscreen. Minimal
  footprint by design.

---

## 3. Scope

**v1 (this spec):** collapsed bar → analyze → expanded synced sheet + transpose + collapse.
Ad-pause, SPA navigation, error/retry, live-stream hiding.

**Deferred:**
- Chord editing in the overlay (exists in the web app; port later).
- Compact player strip (Option B) as an alternate mode; strip-while-watching → expand.
- `chrome.sidePanel` shell — documented **escape hatch** if YouTube DOM churn ever makes
  injection too costly: the panel would move to the browser side panel, keeping the same
  content-script time relay via messaging. No code for it in v1.
- Options page, chart export, Web Store packaging/publication.

---

## 4. Edge cases & risks

| Case | Behavior |
|---|---|
| Ads (`ad-showing`) | pause sync, subtle "ad playing…" indicator, auto-resume |
| SPA navigation | teardown + re-init; collapsed bar on the new video; session-cached charts appear instantly |
| Live streams | bar hidden (`isLiveContent` / duration heuristics) |
| Analysis failure (yt-dlp breakage etc.) | quiet inline error + retry in the bar |
| Insertion selector breaks (YouTube DOM change) | fallback selectors → MutationObserver → if all fail, bar mounts fixed at viewport bottom as a degraded fallback |
| Theater / fullscreen | panel stays in the page flow (below player); it simply isn't visible in fullscreen — acceptable v1 |
| YouTube dark theme | paper panel stays paper (deliberate contrast, per design) |
| API server not running (local demo) | error state: "tabIt server isn't reachable" |

Primary risk is unchanged from the original research: **insertion-point/DOM churn**, contained
by the selector-constant + fallbacks + the documented side-panel escape hatch.

---

## 5. Testing

- **Unit:** insertion-point resolution (fixture DOM), videoId extraction from watch URLs,
  message contract handlers, ad-state detection, chart→render decoration logic (reusing the
  shared helpers' existing tests where applicable).
- **End-to-end (real browser):** Playwright `chromium.launchPersistentContext` with
  `--load-extension`, driving a real YouTube watch page against the running local API:
  bar appears → click → sheet renders (cache-warm video) → highlighter tracks playback →
  transpose works → SPA-navigate to another video → bar resets. Run headfully by the
  controller as done for the web app.
- **Manual checklist:** ad interruption, theater mode, dark theme, live stream, server-down.

---

## 6. Project structure

```
extension/
├── manifest.json
├── src/
│   ├── content/        # injection, sync loop, SPA nav, shadow-DOM mount
│   ├── overlay/        # collapsed bar + panel UI (ported Sheet rendering)
│   ├── background/     # service worker: API client + session cache
│   └── shared/         # chart types + music helpers (shared with web/)
└── tests/
```

(Build tooling — Vite MV3 config, how `shared/` is sourced from `web/src/lib` — is decided in
the implementation plan.)
