# tabIt V1 Web Store Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Chrome extension to the Web Store with a first-run flow that gets a new user from "no helper" to chords using only one pasted Terminal command, and make the helper install work on a Mac that has never had developer tools.

**Architecture:** The extension asks the helper's `/health` (through its background worker) and shows one of four first-run states instead of failing silently. The helper's API gains a Host/Origin guard. The engine ships as a prebuilt wheel attached to each GitHub release, which the existing installer prefers over `git+https`. The signed Setup app is out of scope (v1.1).

**Tech Stack:** TypeScript + React + vitest (extension), Python 3.11 + FastAPI + pytest (api, engine), POSIX sh (`packaging/install.sh`), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-28-tabit-setup-app-design.md` (section "Scope decision": V1 vs v1.1).

Work on a new branch off `main` in its own worktree (`feat/v1-store-release`), not on `feat/setup-app`.

## Global Constraints

- macOS only for V1. Non-Mac browsers see "macOS only for now"; the extension never offers the install command there.
- The only install command shown to users: `curl -fsSL https://raw.githubusercontent.com/paolosand/tabIt/main/packaging/install.sh | sh`. Defined once, in `extension/src/install.ts`.
- Helper port **28224**, launchd label `com.tabit.helper`; both unchanged. `/health` returns `{"status": "ok", "engineVersion": <str>}`.
- `MIN_ENGINE_VERSION = '0.4.0'` in the extension; a helper reporting less is "needs update".
- Offline polling keeps the existing backoff: 3 s base, 30 s max (`OFFLINE_POLL_BASE_MS`, `OFFLINE_POLL_MAX_MS` in `extension/src/overlay/App.tsx`).
- User-facing copy: plain words, no jargon (no "daemon", "port", "venv", "CLI", "launchd"). Strings live in one module (`extension/src/overlay/copy.ts`) so the in-progress redesign can reword them.
- Do not restyle existing extension UI; add new classes only (a redesign is in flight elsewhere). New colors/fonts come from existing tokens in `extension/src/overlay/styles.ts`.
- Extension permissions stay `storage` + host `http://localhost:28224/*`; no new permissions.
- No git on a fresh Mac: the default install path must not invoke `git`.
- Never commit audio, weights, Ultimate Guitar data, or recordings.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A different program (not tabIt) answers on 28224, or `/health` lacks `engineVersion`: treat as helper down, never as "connected" (pinned in Task 2).
2. Clipboard write is refused: the button must not claim "Copied"; it selects the command text instead (Task 3).
3. Host header variants: `localhost:28224`, `LOCALHOST`, `127.0.0.1:28224`, `[::1]:28224` allowed; `localhost.evil.com`, `evil.com`, `127.0.0.1.evil.com`, empty rejected (Task 1).
4. A page's `fetch` with `Origin: https://evil.example` to `POST /analyze` (including multipart upload, a CORS-simple request) must get 403 and not start work (Task 1).
5. SPA navigation unmounts the overlay while a status poll timer is pending: no state update after unmount, no leaked timer (Task 3).
6. `TABIT_REF=main` or an unreleased tag has no release wheel: installer falls back to git when git exists, and fails with a plain sentence when it does not (Task 7).

---

### Task 1: Local API guard (Host and Origin checks)

**Files:**
- Create: `api/guard.py`, `tests/api/test_guard.py`
- Modify: `api/main.py` (register the middleware before `CORSMiddleware`)

**Interfaces:**
- Produces: `host_is_allowed(host: str | None) -> bool`; `origin_is_allowed(origin: str | None, method: str) -> bool`; `class LocalGuardMiddleware` (ASGI middleware) that answers 403 `{"detail": "forbidden"}` when either check fails.

- [ ] **Step 1: Write failing tests** in `tests/api/test_guard.py`: `test_host_allowlist` (assert True for `localhost`, `localhost:28224`, `LOCALHOST:28224`, `127.0.0.1:28224`, `[::1]:28224`, `localhost:5173`; False for `None`, `""`, `evil.com`, `localhost.evil.com`, `127.0.0.1.evil.com`, `localhost:28224@evil.com`); `test_origin_rules` (no Origin allowed for any method; `chrome-extension://abcdef` and `http://localhost:5173` allowed for any method; `https://evil.example` allowed only for GET/HEAD/OPTIONS and rejected for POST/PUT/DELETE); `test_post_analyze_from_web_origin_is_403` and `test_post_upload_multipart_from_web_origin_is_403` using FastAPI `TestClient` with headers `Origin: https://evil.example`, asserting 403 and that `_run_analysis` (monkeypatched) was never called; `test_health_with_bad_host_is_403`; `test_extension_origin_post_still_works`.
- [ ] **Step 2:** Run `pytest tests/api/test_guard.py -q`; expect FAIL (module missing).
- [ ] **Step 3: Implement** `api/guard.py` with the signatures above (parse host by stripping the port and bracketed IPv6, lowercase, compare to `{"localhost", "127.0.0.1", "[::1]"}`; allowed origin prefixes `chrome-extension://` and the exact origin `http://localhost:5173`). Register in `api/main.py`. TestClient's default Host is `testserver`: set the test client's `base_url="http://localhost:28224"` in existing API test fixtures (`tests/api/`), not the guard.
- [ ] **Step 4:** Run `pytest tests/api -q`; expect all PASS.
- [ ] **Step 5: Commit** `feat(api): reject non-local Host and cross-site Origin`.

### Task 2: Extension helper-status plumbing

**Files:**
- Create: `extension/src/version.ts`, `extension/src/platform.ts`, `extension/src/install.ts`, `extension/src/background/helper.ts`, tests `extension/src/version.test.ts`, `extension/src/platform.test.ts`
- Modify: `extension/src/messages.ts`, `extension/src/background/handler.ts`, `extension/src/background/index.ts`, `extension/src/background/handler.test.ts`

**Interfaces:**
- Produces (`version.ts`): `MIN_ENGINE_VERSION = '0.4.0'`; `isOlderThan(version: string, minimum: string): boolean` (numeric dotted compare, drops a `-suffix`, unparseable returns `false`).
- Produces (`platform.ts`): `isMac(nav?: Pick<Navigator, 'platform'> & { userAgentData?: { platform: string } }): boolean`.
- Produces (`install.ts`): `INSTALL_COMMAND: string` (the constant from Global Constraints), `INSTALL_PAGE_URL = 'https://github.com/paolosand/tabIt#install'`.
- Produces (`messages.ts`): `GetHelperStatusRequest = { type: 'GET_HELPER_STATUS' }`; `HelperStatusResponse = { state: 'up'; tooOld: boolean } | { state: 'down'; everSeen: boolean }`.
- Produces (`handler.ts`): `handleGetHelperStatus(): Promise<HelperStatusResponse>`; uses `chrome.storage.local` key `helperSeen`.
- Produces (`helper.ts`): `getHelperStatus(): Promise<{ state: 'up'; engineVersion: string } | { state: 'down' }>`.

- [ ] **Step 1: Failing tests.** `version.test.ts`: `isOlderThan('0.3.1','0.4.0')` true; `('0.4.0','0.4.0')` false; `('0.4.0-btc','0.4.0')` false; `('0.10.0','0.9.0')` false; `('weird','0.4.0')` false. `platform.test.ts`: `userAgentData.platform === 'macOS'` true; `platform: 'MacIntel'` true; `'Win32'` and `'Linux x86_64'` false. `handler.test.ts` (existing mock style): `/health` returns `{status:'ok',engineVersion:'0.4.0'}` gives `{state:'up',tooOld:false}` and sets `helperSeen`; version `0.3.1` gives `tooOld:true`; fetch rejecting with `TypeError` gives `{state:'down',everSeen:false}`, and `{...everSeen:true}` after `helperSeen` was set; a 200 response whose JSON has no `engineVersion` (another program on the port) gives `down`; a 500 gives `down`.
- [ ] **Step 2:** `cd extension && npx vitest run`; expect FAIL.
- [ ] **Step 3: Implement** the interfaces above; wire `GET_HELPER_STATUS` in `background/index.ts` next to `GET_CHART`.
- [ ] **Step 4:** `npx vitest run && npx tsc --noEmit`; expect PASS.
- [ ] **Step 5: Commit** `feat(extension): helper status, version floor and platform check`.

### Task 3: First-run states in the overlay

**Files:**
- Create: `extension/src/overlay/copy.ts`
- Modify: `extension/src/overlay/Bar.tsx`, `extension/src/overlay/App.tsx`, `extension/src/overlay/styles.ts` (new classes `tabit-bar-setup`, `tabit-bar-unsupported`, `tabit-copy-row` only), tests `Bar.test.tsx`, `App.test.tsx`

**Interfaces:**
- Consumes: Task 2's `HelperStatusResponse`, `INSTALL_COMMAND`, `isMac`.
- Produces (`Bar.tsx`): new variants `{ variant: 'setup'; mode: 'install' | 'update'; onCopy: () => Promise<boolean>; }` and `{ variant: 'unsupported' }`; `collapsed` gains optional `justConnected?: boolean` (renders "Helper connected").
- Produces (`copy.ts`): exported string constants for every new sentence, including the three steps ("Open Terminal (press Cmd+Space, type Terminal, press Return)", "Paste the command, press Return", "Come back here. This page finds tabIt on its own"), button labels "Copy command"/"Copied" (and a "Select the command, then press Cmd+C" fallback line), and the unsupported message "tabIt needs a Mac for now". The existing offline sentence changes to plain words ("tabIt isn't running. Open Terminal and paste: tabit restart") with the same Copy button for `tabit restart`.

- [ ] **Step 1: Failing tests.** `Bar.test.tsx`: setup bar renders the install command text, the three steps and a Copy button; clicking Copy calls `onCopy`, shows "Copied" only when it resolves `true`, and shows the select-and-copy fallback line when it resolves `false`; unsupported bar has no command text. `App.test.tsx` (existing chrome mock): helper `down` + `everSeen:false` shows the setup bar on mount without clicking anything; when a later `GET_HELPER_STATUS` returns `up`, the collapsed bar shows "Helper connected"; `up` + `tooOld` shows setup with `mode: 'update'`; `down` + `everSeen:true` stays collapsed until "Get chords" is clicked and then shows the offline bar; `isMac` false shows unsupported and sends no status message; unmounting while a status timer is pending causes no later `sendMessage` and no state update (fake timers).
- [ ] **Step 2:** `npx vitest run`; expect FAIL.
- [ ] **Step 3: Implement.** In `App.tsx` add a mount effect that calls `isMac()` then sends `GET_HELPER_STATUS`; poll again with the existing offline backoff while in `setup`; `onCopy` calls `navigator.clipboard.writeText(INSTALL_COMMAND)` and resolves `false` on rejection. Keep every timer in the existing `timerRef`/`aliveRef` pattern.
- [ ] **Step 4:** `npx vitest run && npx tsc --noEmit && npm run build`; expect PASS.
- [ ] **Step 5: Commit** `feat(extension): first-run install, update and unsupported states`.

### Task 4: Web Store icons and manifest

**Files:**
- Create: `extension/icons/icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`, `extension/scripts/make-icons.sh`, `extension/src/manifest.test.ts`
- Modify: `extension/manifest.json`, `extension/build.mjs` (copy `icons/` into `dist/icons/`)

**Interfaces:**
- Produces: `manifest.json` has `"icons": {"16","32","48","128"}` pointing at `icons/iconN.png`, and `version` equal to the extension's `package.json` version.

- [ ] **Step 1: Failing test** `manifest.test.ts`: reads `manifest.json`; asserts the four icon keys; asserts each referenced file exists under `extension/icons/` and is a PNG of the stated square size (read the IHDR bytes); asserts `permissions` equals `['storage']` and `host_permissions` equals `['http://localhost:28224/*']`; asserts manifest `version` equals `package.json` `version`.
- [ ] **Step 2:** `npx vitest run src/manifest.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.** `make-icons.sh` renders the four sizes from `docs/assets/logo-light.svg` with `sips` (placeholder art; the redesigned mark replaces the PNGs later, nothing else changes). Add `icons` to the manifest and the copy step to `build.mjs`.
- [ ] **Step 4:** `npx vitest run && npm run build && ls dist/icons`; expect PASS and four PNGs listed.
- [ ] **Step 5: Commit** `feat(extension): store icons and manifest icons entry`.

### Task 5: Store listing, privacy policy and reviewer instructions

**Files:**
- Create: `PRIVACY.md`, `docs/store/listing.md`, `docs/store/reviewer-instructions.md`, `docs/store/screenshots.md`, `packaging/store/crop-screenshot.sh`
- Modify: `README.md` (install section: first-run flow and a link to `PRIVACY.md`), `docs/store-listing-draft.md` (replace its body with a pointer to `docs/store/listing.md`)

- [ ] **Step 1:** Write `PRIVACY.md` from the draft policy line in `docs/store-listing-draft.md`, made accurate: nothing collected or sent to the developer; the helper runs on the user's Mac and downloads the audio of the video the user asks about from YouTube, plus its model file from GitHub at first use; the extension stores only a "helper seen" flag and cached charts for the browser session in `chrome.storage`; no analytics; macOS only.
- [ ] **Step 2:** Write `docs/store/listing.md`: short description (<= 132 chars) and detailed description whose first sentence is "Requires the free tabIt helper for macOS (installed with one command)"; single-purpose statement; permission justifications (storage, `http://localhost:28224/*` to reach the user's own helper, content script on `youtube.com`); the privacy-policy URL `https://github.com/paolosand/tabIt/blob/main/PRIVACY.md`; category. Write `docs/store/reviewer-instructions.md`: macOS needed, the install command, expected ~1 GB, a known-good video URL, what a pass looks like. Write `docs/store/screenshots.md` (required 1280x800 PNG, up to 5, own footage only, crop out the YouTube header) and `crop-screenshot.sh <in.png> <out.png>` that crops the top 110 px and resizes to 1280x800 with `sips`.
- [ ] **Step 3: Verify:** `grep -c "28224" docs/store/listing.md` is at least 1; the permission list in `listing.md` matches `extension/manifest.json` exactly (run `node -e` to compare); `sh -n packaging/store/crop-screenshot.sh`; run the script on any PNG and confirm `sips -g pixelWidth -g pixelHeight` prints 1280 and 800.
- [ ] **Step 4: Commit** `docs: privacy policy, store listing, reviewer instructions`.

### Task 6: Self-contained engine wheel

**Files:**
- Modify: `pyproject.toml` (`[build-system]` with setuptools; package data for `engine/vendor/btc` including `LICENSE` and `NOTICE.md`)
- Create: `tests/packaging/test_wheel.py`

**Interfaces:**
- Produces: `pip wheel . --no-deps` yields `tabit_engine-<version>-py3-none-any.whl` containing everything needed at runtime.

- [ ] **Step 1: Failing test** `test_wheel_contents` (builds into a tmp dir with `pip wheel . --no-deps --no-build-isolation -w <tmp>`; marked so it runs in the normal suite): the zip contains `engine/vendor/btc/model.py`, `engine/vendor/btc/LICENSE`, `engine/vendor/btc/NOTICE.md`, `api/main.py`, `api/guard.py`, `helper/cli.py`, `engine/pipeline.py`; metadata has `Provides-Extra: api` and `Requires-Dist` for `torch`; the filename version equals `engine.__version__`; the zip contains no `.wav`, `.pt` or `tests/`.
- [ ] **Step 2:** `pytest tests/packaging -q`; expect FAIL on missing vendor files.
- [ ] **Step 3: Implement** the build config; keep `[tool.setuptools.packages.find] include` as is, add `package-data`.
- [ ] **Step 4:** `pytest tests/packaging -q`; expect PASS.
- [ ] **Step 5: Commit** `build: self-contained wheel including vendored BTC`.

### Task 7: Installer prefers the release wheel, never needs git

**Files:**
- Modify: `packaging/install.sh`, `.github/workflows/installer-e2e.yml`

**Interfaces:**
- Consumes: Task 6's wheel; release asset URL `https://github.com/paolosand/tabIt/releases/download/<TABIT_REF>/tabit_engine-<TABIT_REF without v>-py3-none-any.whl`.
- Produces: env var `TABIT_WHEEL` (path or URL, overrides everything); install-source order: `TABIT_WHEEL`, then the release wheel when `TABIT_REPO` is the default and `TABIT_REF` is a `v<digits>` tag, then `git+` only if `git` is available, else `fail` with "tabIt can't download its engine. Check your internet connection and run the command again."; file `~/Library/Application Support/tabIt/VERSION` containing the installed version, written after warmup succeeds.

- [ ] **Step 1: Failing check** (CI-level, no new harness): in `installer-e2e.yml`, build the wheel from the checkout, set `TABIT_WHEEL` for the install step, and add assertions after install: `VERSION` file exists and equals `engine.__version__`; `"$ENV/bin/python" -c "import importlib.metadata as m; import json; print(m.distribution('tabit-engine').read_text('direct_url.json') or '')"` output contains `file://` and not `git+`; and a step that runs the installer with `PATH` stripped of `git` and `TABIT_REF=main` (no wheel) and expects exit 1 with the plain sentence above. Run `gh workflow run installer-e2e.yml` on the branch; expect the new assertions FAIL before Step 3.
- [ ] **Step 2:** `sh -n packaging/install.sh && dash -n packaging/install.sh && shellcheck -s sh packaging/install.sh` stay clean after every edit; the truncated-download guard (`main` called as the literal last line) must remain.
- [ ] **Step 3: Implement** the source-selection function in `install.sh` and the `VERSION` write; keep all existing upgrade/recovery logic untouched.
- [ ] **Step 4:** Re-run the workflow; expect all steps PASS.
- [ ] **Step 5: Commit** `feat(installer): install the engine from the release wheel; no git on a fresh Mac`.

### Task 8: Release pipeline and release checklist

**Files:**
- Modify: `.github/workflows/release-extension.yml` (also builds and attaches the wheel; add `workflow_dispatch` with a `tag` input so an existing release can be re-run)
- Create: `docs/RELEASING.md`
- Modify (version bump to `0.4.1`): `pyproject.toml`, `engine/__init__.py` (`__version__`), `extension/manifest.json`, `extension/package.json`, `packaging/install.sh` (`TABIT_REF` default `v0.4.1`)

- [ ] **Step 1: Failing check:** add a pytest `tests/packaging/test_versions_match.py::test_all_versions_equal` asserting `pyproject.toml`, `engine.__version__`, `extension/manifest.json`, `extension/package.json` and the `TABIT_REF` default in `packaging/install.sh` all carry the same version; expect FAIL until the bump is complete, then PASS.
- [ ] **Step 2: Implement** the workflow steps (setup-python 3.11, `pip wheel . --no-deps -w wheel-dist`, `gh release upload` of the wheel next to the extension zip, then a verification step that fails if the wheel file name does not contain the tag's version) and write `docs/RELEASING.md`: bump the five version places together, merge, tag `vX.Y.Z`, `gh release create`, wait for the workflow, confirm the wheel and the extension zip are attached, upload the zip to the Web Store dashboard (owner), and, once the setup app exists (v1.1), attach it before publishing.
- [ ] **Step 3:** Run `pytest -q`, `cd extension && npx vitest run && npx tsc --noEmit`; expect PASS.
- [ ] **Step 4: Commit** `chore(release): wheel in release CI, release checklist, bump to 0.4.1`.
- [ ] **Step 5 (after merge, owner approves):** tag `v0.4.1`, publish the release, confirm the two assets, then run the install command from `docs/store/reviewer-instructions.md` on a throwaway macOS user account.

## Owner tasks (not code)

- Record 3 to 5 screenshots on your own video; run `packaging/store/crop-screenshot.sh`.
- Register the Web Store developer account ($5) and upload `tabit-extension-v0.4.1.zip` with the text in `docs/store/listing.md`.
- Email the BTC authors about the weights' licence (draft available on request).
- Replace the placeholder icons with the redesigned mark when ready.

## Order

Store critical path first: Tasks 2, 3, 4, 5 (then upload the extension build). Tasks 1, 6, 7, 8 can proceed while the listing is in review, but Tasks 7 and 8 must land before the Store listing goes public so the install command works on a Mac without developer tools.
