# Feedback Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users report a bad transcription in one click, and let opted-in users share which songs they analyze (charts and failures included), stored in Supabase.

**Architecture:** The extension's background service worker POSTs small JSON rows to Supabase's PostgREST endpoint using the public anon key. Row Level Security allows insert only (no select, no update). A new `telemetry/` module owns settings, error scrubbing, the HTTP client and the record functions; `handler.ts` calls it fire-and-forget at the points where an analysis finishes or fails. The overlay gains a report control and a sharing toggle, which talk to the background through new message types.

**Tech Stack:** TypeScript, React 19, Vitest (jsdom), esbuild, Chrome MV3, Supabase (Postgres + PostgREST + RLS, pgTAP tests via the Supabase CLI).

**Spec:** `docs/superpowers/specs/2026-11-02-feedback-loop-design.md`

## Global Constraints

- Work on branch `worktree-feedback-loop` (based on `staging`). Never commit or push to `main`. Do not bump versions in `extension/manifest.json`, `extension/package.json` or `pyproject.toml`.
- Compute stays local; Supabase only stores rows. No transcription server.
- Usage sharing is **opt-in, off by default**. A report is consented per click and always carries the chart, even with sharing off.
- Never sent: audio, cookies, account info, browsing history, other tabs.
- Failed analyses are logged **only** for opted-in users: video ID, engine version, install ID, timestamp, error category (`download_failed` | `video_unavailable` | `engine_error` | `timeout`) and a message with home-directory paths scrubbed, first line only, capped at 300 characters. No chart, no stack trace.
- The helper being unreachable (`status: 'offline'`) is not a song failure and is never logged.
- Chart size check: about 256 KB (`262144` bytes). Real charts are 12–38 KB.
- Install ID: random UUID, created lazily on first report or opt-in, stored in `chrome.storage.local`.
- Network calls are fire-and-forget with a 5000 ms timeout; failure must never change what chords the user sees.
- RLS: anon may insert only. No select, no update, no delete. Project URL and anon key are injected at build time (`SUPABASE_URL`, `SUPABASE_ANON_KEY`), never hand-edited into source.
- Migrations live in `supabase/migrations`; tests in `supabase/tests`.
- `PRIVACY.md`, README and the Web Store data disclosure must match shipped behavior (it currently says "does not collect anything" and "runs no servers").
- Follow `DESIGN.md` for overlay UI. End commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Supabase unreachable, slow or returning errors: the chart still shows and nothing throws (Task 2, Task 5).
2. Sharing off: zero network calls for analyses and failures (Task 5).
3. Helper offline (`TypeError`) must not be logged as a failure (Task 5).
4. Duplicate chart upload (same video + engine version) is silently ignored and never overwrites the stored chart (Task 1, Task 2).
5. Error messages containing `/Users/<name>/...` paths, multi-line stack traces or very long text (Task 3).

## File Structure

- Create `supabase/migrations/20261102000000_feedback_loop.sql` — tables, constraints, grants, RLS.
- Create `supabase/tests/rls.test.sql` — pgTAP RLS tests.
- Create `extension/src/telemetry/config.ts` — build-time constants.
- Create `extension/src/telemetry/client.ts` — `insertRow`.
- Create `extension/src/telemetry/settings.ts` — sharing flag and install ID.
- Create `extension/src/telemetry/errors.ts` — `classifyError`, `scrubMessage`.
- Create `extension/src/telemetry/record.ts` — record/report functions.
- Create `extension/src/overlay/ReportControl.tsx`, `extension/src/overlay/SharingToggle.tsx` (+ tests).
- Modify `extension/src/messages.ts`, `extension/src/background/handler.ts`, `extension/src/background/index.ts`, `extension/src/overlay/Panel.tsx`, `extension/src/overlay/copy.ts`, `extension/src/overlay/styles.ts`.
- Modify `extension/build.mjs`, `extension/vitest.config.ts`, `extension/src/manifest.test.ts`, `.github/workflows/release-extension.yml`.
- Modify `PRIVACY.md`, `README.md`, `docs/store-listing-draft.md`.

---

### Task 1: Supabase schema and RLS

**Files:**
- Create: `supabase/migrations/20261102000000_feedback_loop.sql`
- Test: `supabase/tests/rls.test.sql`

**Interfaces:**
- Produces (tables, used by every later task):
  - `charts(video_id text, engine_version text, title text, chart jsonb, first_seen timestamptz default now(), primary key (video_id, engine_version))`
  - `analyses(id bigint identity pk, install_id uuid, video_id text, engine_version text null, outcome text check in ('ok','failed'), error_category text null, error_message text null, created_at timestamptz default now())`
  - `reports(id uuid pk, install_id uuid, video_id text, engine_version text, status text default 'new', created_at timestamptz default now())`
  - `report_details(id bigint identity pk, report_id uuid, reason text check in ('chords','key','tempo','other'), note text null, created_at timestamptz default now())`

**Prerequisite (the developer does this once, before Step 1):** In the dashboard of the dormant Supabase project, confirm it holds nothing worth keeping (tables, auth users, storage, edge functions), then reset it (do not delete it). Check it is not paused. Note the project URL and anon key for Task 2. Requires the Supabase CLI and Docker for local tests.

- [ ] **Step 1: Write the failing pgTAP tests** in `supabase/tests/rls.test.sql`, each run `set local role anon`:
  - inserting a valid row succeeds in each of the four tables;
  - `select count(*) from charts` as anon returns 0 rows even after an insert (no select policy);
  - `update reports set status = 'closed'` affects 0 rows / is denied; `delete from charts` is denied;
  - inserting a report with `status = 'closed'` is rejected (insert must force `'new'`);
  - inserting a chart with a `video_id` that is not 11 chars of `[A-Za-z0-9_-]` is rejected;
  - inserting a chart over 262144 bytes is rejected;
  - inserting the same `(video_id, engine_version)` chart twice with `on conflict do nothing` succeeds and the stored `chart` is still the first one (check as service role);
  - an `analyses` row with `outcome = 'failed'` and a 301-character `error_message` is rejected; a `report_details` row with `reason = 'bogus'` is rejected.

- [ ] **Step 2: Run to verify failure**

Run: `supabase start && supabase test db`
Expected: FAIL (tables do not exist).

- [ ] **Step 3: Write the migration.** Create the four tables above with `check` constraints for the video ID regex `^[A-Za-z0-9_-]{11}$`, `octet_length(chart::text) <= 262144`, `char_length(error_message) <= 300`, `char_length(note) <= 500`. Enable RLS on all four; `revoke all` from `anon` and `authenticated`, then `grant insert` to `anon`; add one `for insert to anon` policy per table (`with check (true)`, except `reports` which uses `with check (status = 'new')`). Add no other policies.

- [ ] **Step 4: Run to verify pass**

Run: `supabase db reset && supabase test db`
Expected: all pgTAP tests PASS.

- [ ] **Step 5: Apply to the real project and commit.** Run `supabase link --project-ref <ref> && supabase db push` (the developer supplies the ref), then:

```bash
git add supabase
git commit -m "feat(supabase): feedback-loop tables with insert-only RLS"
```

---

### Task 2: Telemetry client, build-time config and manifest host

**Files:**
- Create: `extension/src/telemetry/config.ts`, `extension/src/telemetry/client.ts`
- Test: `extension/src/telemetry/client.test.ts`
- Modify: `extension/build.mjs`, `extension/vitest.config.ts`, `extension/src/manifest.test.ts`, `.github/workflows/release-extension.yml`

**Interfaces:**
- Produces:
  - `config.ts`: `export const SUPABASE_URL: string; export const SUPABASE_ANON_KEY: string;` read from esbuild-defined globals `__SUPABASE_URL__` / `__SUPABASE_ANON_KEY__` (empty string when unset).
  - `client.ts`: `export type TelemetryTable = 'charts' | 'analyses' | 'reports' | 'report_details'; export async function insertRow(table: TelemetryTable, row: Record<string, unknown>, opts?: { ignoreDuplicates?: boolean }): Promise<boolean>` — never throws; `false` on any failure.

- [ ] **Step 1: Write failing tests** in `client.test.ts` with `fetch` mocked:
  - `insertRow('analyses', row)` POSTs to `https://test.supabase.co/rest/v1/analyses` with headers `apikey` and `Authorization: Bearer test-anon`, `Content-Type: application/json`, `Prefer: return=minimal`, body `JSON.stringify(row)`, and resolves `true` on a 201;
  - with `{ ignoreDuplicates: true }` for `charts` the URL has `?on_conflict=video_id,engine_version` and `Prefer` is `resolution=ignore-duplicates,return=minimal`;
  - resolves `false` (no throw) when fetch rejects, when the response is 4xx/5xx, and when the call exceeds 5000 ms (use fake timers; the request is aborted via `AbortSignal.timeout(5000)`);
  - resolves `false` without calling fetch when `SUPABASE_URL` is empty (mock `config.ts` for this case).

- [ ] **Step 2: Run to verify failure**

Run: `cd extension && npx vitest run src/telemetry/client.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `config.ts` and `insertRow`** per the signatures above. In `vitest.config.ts` add `define: { __SUPABASE_URL__: '"https://test.supabase.co"', __SUPABASE_ANON_KEY__: '"test-anon"' }`.

- [ ] **Step 4: Wire the build.** In `build.mjs`, read `process.env.SUPABASE_URL` / `SUPABASE_ANON_KEY` (default `''`) and pass them as esbuild `define` values (`__SUPABASE_URL__`, `__SUPABASE_ANON_KEY__`, JSON-stringified) for the **background** build. After copying the manifest, when `SUPABASE_URL` is set, rewrite `dist/manifest.json` to append `${SUPABASE_URL}/*` to `host_permissions`. A build without the variables must still succeed (telemetry becomes a no-op). In `release-extension.yml`, pass both from repository variables and fail the job if either is empty.

- [ ] **Step 5: Extend `manifest.test.ts`:** add a test that runs the build with `SUPABASE_URL=https://abc.supabase.co` and asserts `dist/manifest.json` `host_permissions` equals `['http://localhost:28224/*', 'https://abc.supabase.co/*']`; keep the existing source-manifest test unchanged (source stays localhost-only).

- [ ] **Step 6: Run to verify pass**

Run: `cd extension && npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add extension .github
git commit -m "feat(extension): Supabase insert client with build-time config"
```

---

### Task 3: Settings store and error scrubbing

**Files:**
- Create: `extension/src/telemetry/settings.ts`, `extension/src/telemetry/errors.ts`
- Test: `extension/src/telemetry/settings.test.ts`, `extension/src/telemetry/errors.test.ts`

**Interfaces:**
- Produces:
  - `settings.ts`: `getShareUsage(): Promise<boolean>` (default `false`; `false` if storage throws); `setShareUsage(on: boolean): Promise<void>`; `getInstallId(): Promise<string>` (creates with `crypto.randomUUID()` on first call, then returns the same value). Keys in `chrome.storage.local`: `shareUsage`, `installId`.
  - `errors.ts`: `export type ErrorCategory = 'download_failed' | 'video_unavailable' | 'engine_error' | 'timeout'; export function classifyError(message: string): ErrorCategory; export function scrubMessage(message: string): string`.

- [ ] **Step 1: Write failing tests.**
  - settings: default off; `setShareUsage(true)` then `getShareUsage()` is `true`; `getInstallId()` twice returns the same UUID and nothing is stored before the first call; a throwing `chrome.storage.local.get` yields `false`.
  - errors, `scrubMessage`: `'failed at /Users/paolosandejas/Library/Application Support/tabIt/x'` → `'failed at /Users/<user>/Library/Application Support/tabIt/x'`; `/home/bob/x` → `/home/<user>/x`; a three-line traceback keeps only the first line; a 500-character message is cut to exactly 300 characters.
  - errors, `classifyError`: `'Video unavailable'`, `'Private video'` and `'Sign in to confirm your age'` → `video_unavailable`; `'HTTP Error 403: Forbidden'` and `'yt-dlp download failed'` → `download_failed`; `'timed out'` → `timeout`; anything else (for example `'ValueError: bad shape'`) → `engine_error`.

- [ ] **Step 2: Run to verify failure**

Run: `cd extension && npx vitest run src/telemetry/settings.test.ts src/telemetry/errors.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** the functions per the signatures. `classifyError` is an ordered case-insensitive keyword match (unavailable/private/removed/age/sign in → `video_unavailable`; timed out/timeout → `timeout`; download/yt-dlp/HTTP Error/403/network → `download_failed`; default `engine_error`). `scrubMessage` replaces the user segment after `/Users/` and `/home/`, takes the first line, then slices to 300.

- [ ] **Step 4: Run to verify pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/telemetry
git commit -m "feat(extension): sharing settings, install ID and error scrubbing"
```

---

### Task 4: Record and report functions

**Files:**
- Create: `extension/src/telemetry/record.ts`
- Test: `extension/src/telemetry/record.test.ts`
- Modify: `extension/src/messages.ts` (add `ReportReason`)

**Interfaces:**
- Consumes: `insertRow` (Task 2), `getShareUsage`, `getInstallId` (Task 3), `classifyError`, `scrubMessage` (Task 3).
- Produces:
  - `messages.ts`: `export type ReportReason = 'chords' | 'key' | 'tempo' | 'other';`
  - `record.ts`:
    - `recordAnalysis(chart: Chart): Promise<void>` — no-op unless sharing is on; inserts the chart (`ignoreDuplicates`) then an `analyses` row with `outcome: 'ok'`.
    - `recordFailure(videoId: string, message: string, engineVersion: string | null): Promise<void>` — no-op unless sharing is on; inserts an `analyses` row with `outcome: 'failed'`, `error_category`, scrubbed `error_message`, no chart.
    - `submitReport(chart: Chart, reportId: string): Promise<boolean>` — ignores the sharing setting; inserts the chart (`ignoreDuplicates`) then a `reports` row `{ id: reportId, install_id, video_id, engine_version }`; `true` only if the report row was accepted.
    - `submitReportDetails(reportId: string, reason: ReportReason, note: string): Promise<boolean>` — inserts a `report_details` row; empty note stored as `null`.
  - The chart row is `{ video_id: chart.source.videoId, engine_version: chart.analysis.engineVersion, title: chart.source.title, chart }`.

- [ ] **Step 1: Write failing tests** with `insertRow` mocked (`vi.mock('./client')`): sharing off → `recordAnalysis` and `recordFailure` make zero `insertRow` calls; sharing on → `recordAnalysis` calls `charts` (with `ignoreDuplicates: true`) then `analyses`; `recordFailure('abc12345678', 'HTTP Error 403 at /Users/me/x', '0.4.1')` inserts `{ outcome: 'failed', error_category: 'download_failed', error_message: 'HTTP Error 403 at /Users/<user>/x', engine_version: '0.4.1' }`; `submitReport` with sharing **off** still inserts chart then report and returns `true`; returns `false` when the report insert returns `false`; none of the functions reject when `insertRow` returns `false`.

- [ ] **Step 2: Run to verify failure**

Run: `cd extension && npx vitest run src/telemetry/record.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** the four functions per the signatures above.

- [ ] **Step 4: Run to verify pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src
git commit -m "feat(extension): record analyses, failures and reports"
```

---

### Task 5: Background wiring and messages

**Files:**
- Modify: `extension/src/messages.ts`, `extension/src/background/handler.ts`, `extension/src/background/index.ts`
- Test: `extension/src/background/handler.test.ts`, `extension/src/background/index.test.ts`

**Interfaces:**
- Consumes: Task 4 functions; `getHelperStatus` from `background/helper.ts` (returns `{ state: 'up', engineVersion }` or `{ state: 'down' }`).
- Produces in `messages.ts`:
  - `ReportRequest { type: 'REPORT_BAD_TRANSCRIPTION'; chart: Chart; reportId: string }` → `OkResponse { ok: boolean }`
  - `ReportDetailsRequest { type: 'REPORT_DETAILS'; reportId: string; reason: ReportReason; note: string }` → `OkResponse`
  - `GetSharingRequest { type: 'GET_SHARING' }` and `SetSharingRequest { type: 'SET_SHARING'; shareUsage: boolean }` → `SharingResponse { shareUsage: boolean }`
- Produces in `handler.ts`: `handleReport(req: ReportRequest): Promise<OkResponse>`, `handleReportDetails(req: ReportDetailsRequest): Promise<OkResponse>`, `handleGetSharing(): Promise<SharingResponse>`, `handleSetSharing(on: boolean): Promise<SharingResponse>`.

- [ ] **Step 1: Write failing tests** in `handler.test.ts` (mock `./api`, `./helper`, `../telemetry/record`):
  - a job that resolves `done` calls `recordAnalysis(chart)` once and still returns `{ status: 'done', chart }`;
  - `fetchCachedChart` returning a chart calls `recordAnalysis` once; a second `handleGetChart` (session-cache hit) does **not** call it again;
  - a job resolving `{ status: 'error', error: 'HTTP Error 403' }` calls `recordFailure(videoId, 'HTTP Error 403', '<engineVersion from getHelperStatus>')` and returns `{ status: 'error', ... }`; when `getHelperStatus` is down the engine version argument is `null`;
  - a `TypeError` (offline) calls neither `recordAnalysis` nor `recordFailure` and returns `{ status: 'offline' }`;
  - if `recordAnalysis` rejects or never resolves, `handleGetChart` still resolves with the chart (recording is not awaited);
  - `handleSetSharing(true)` persists and `handleGetSharing()` returns `{ shareUsage: true }`.
  In `index.test.ts`: each new message type is routed to its handler and the listener returns `true`.

- [ ] **Step 2: Run to verify failure**

Run: `cd extension && npx vitest run src/background`
Expected: FAIL.

- [ ] **Step 3: Implement** the handlers and routing. In `handleGetChart`, call recording as `void recordAnalysis(chart).catch(() => {})` at the two places a chart first becomes available (job done; cached chart fetched), and `void recordFailure(...)` where the job state is `error` and where a non-`TypeError` exception becomes `{ status: 'error' }`. Never `await` them.

- [ ] **Step 4: Run to verify pass**

Run: `cd extension && npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src
git commit -m "feat(extension): background handlers for reports, sharing and usage recording"
```

---

### Task 6: Report control in the panel

**Files:**
- Create: `extension/src/overlay/ReportControl.tsx`
- Test: `extension/src/overlay/ReportControl.test.tsx`
- Modify: `extension/src/overlay/Panel.tsx`, `extension/src/overlay/copy.ts`, `extension/src/overlay/styles.ts`

**Interfaces:**
- Consumes: `REPORT_BAD_TRANSCRIPTION` and `REPORT_DETAILS` messages (Task 5), `ReportReason`.
- Produces: `export default function ReportControl({ chart }: { chart: Chart }): JSX.Element`, rendered in a new feedback row at the bottom of the panel card in `Panel.tsx`. Strings go in `copy.ts` as named exports.

- [ ] **Step 1: Write failing tests** (mock `chrome.runtime.sendMessage`):
  - the button "Report bad transcription" is visible; one click sends exactly one `REPORT_BAD_TRANSCRIPTION` message containing the chart and a UUID `reportId`;
  - after a successful response, a "Thanks — what was off?" follow-up appears with buttons Chords / Key / Tempo / Other and an optional note field; choosing a reason and pressing Send sends `REPORT_DETAILS` with the same `reportId`, the reason and the note; the report is not re-sent;
  - when the response is `{ ok: false }` or the message rejects, the control shows a quiet "Couldn't send — try again" and the button is usable again;
  - after one report the button is disabled/replaced for that chart (no double-report); a new `chart` prop resets it.
  - existing `Panel.test.tsx` still passes (the chrome stub's `sendMessage` resolves `undefined`).

- [ ] **Step 2: Run to verify failure**

Run: `cd extension && npx vitest run src/overlay`
Expected: FAIL.

- [ ] **Step 3: Implement** `ReportControl` and mount it in `Panel.tsx` below the view toggle. Use existing `tabit-*` class conventions in `styles.ts` and the tokens in `DESIGN.md`; keep it visually quiet (a small text button, not a banner).

- [ ] **Step 4: Run to verify pass**

Run: `cd extension && npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/overlay
git commit -m "feat(extension): one-click report bad transcription in the panel"
```

---

### Task 7: Sharing toggle

**Files:**
- Create: `extension/src/overlay/SharingToggle.tsx`
- Test: `extension/src/overlay/SharingToggle.test.tsx`
- Modify: `extension/src/overlay/Panel.tsx`, `extension/src/overlay/copy.ts`, `extension/src/overlay/styles.ts`

**Interfaces:**
- Consumes: `GET_SHARING` / `SET_SHARING` (Task 5).
- Produces: `export default function SharingToggle(): JSX.Element` (no props), rendered in the same feedback row as `ReportControl`.

- [ ] **Step 1: Write failing tests:**
  - renders a checkbox labelled "Help improve tabIt", unchecked on mount until `GET_SHARING` resolves; checked when it resolves `{ shareUsage: true }`; unchecked when the response is `undefined`;
  - toggling sends `SET_SHARING` with the new value and reflects the returned `shareUsage`;
  - the explanatory copy is visible and reads exactly: "Shares which songs you analyze and the charts tabIt makes for them, including songs that fail. No account or name." (export as `SHARING_NOTE` in `copy.ts`).

- [ ] **Step 2: Run to verify failure**

Run: `cd extension && npx vitest run src/overlay/SharingToggle.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** `SharingToggle` and mount it next to `ReportControl` in `Panel.tsx`.

- [ ] **Step 4: Run to verify pass**

Run: `cd extension && npx vitest run && npm run typecheck && npm run build`
Expected: PASS and `built dist/`.

- [ ] **Step 5: Commit**

```bash
git add extension/src/overlay
git commit -m "feat(extension): opt-in 'Help improve tabIt' toggle"
```

---

### Task 8: Privacy documents

**Files:**
- Modify: `PRIVACY.md`, `README.md`, `docs/store-listing-draft.md`

- [ ] **Step 1: Rewrite `PRIVACY.md`.** Replace "does not collect anything" / "runs no servers" with accurate text covering: what a report sends; what the opt-in sends (video ID, title, engine version, install ID, timestamp, chart, and failure reason); that the video ID reveals which video was analyzed; no audio, account, history or tabs; the install ID is random; turning sharing off stops future uploads and deletes nothing already sent; how to ask for deletion (a GitHub issue naming the install ID); that data is stored in Supabase. Update "Last updated".

- [ ] **Step 2: Update `README.md` and `docs/store-listing-draft.md`:** remove or qualify any "nothing leaves your machine" claims, describe the opt-in and report button, and add the Web Store data-usage disclosure (what is collected, that it is opt-in, not sold, used only to improve tabIt).

- [ ] **Step 3: Verify**

Run: `grep -rniE "does not collect|no servers|nothing (leaves|is sent)" PRIVACY.md README.md docs/store-listing-draft.md`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add PRIVACY.md README.md docs/store-listing-draft.md
git commit -m "docs: privacy policy, README and store disclosure for the feedback loop"
```

---

### Task 9: End-to-end check and launch readiness

**Files:** none (verification only; record results in the PR description).

- [ ] **Step 1: Build against the real project:** `cd extension && SUPABASE_URL=<url> SUPABASE_ANON_KEY=<key> npm run build`, load `dist/` unpacked in Chrome with the helper running.
- [ ] **Step 2: Sharing off:** analyze a song; confirm in the Supabase table editor that `analyses` and `charts` gained **no** rows; click "Report bad transcription"; confirm one `charts` row and one `reports` row appear, then pick a reason and confirm a `report_details` row.
- [ ] **Step 3: Sharing on:** analyze a new song; confirm one `charts` row and one `analyses` row with `outcome = 'ok'`; reload the same video and confirm no duplicate chart and no extra `analyses` row in the same session.
- [ ] **Step 4: Failure:** analyze a private or removed video with sharing on; confirm an `analyses` row with `outcome = 'failed'`, a category, and a scrubbed message.
- [ ] **Step 5: Resilience:** block the Supabase host (for example with Chrome's request blocking), analyze a song and click report; confirm chords still render and nothing errors in the console.
- [ ] **Step 6: Anon read check:** `curl "$SUPABASE_URL/rest/v1/reports?select=*" -H "apikey: $SUPABASE_ANON_KEY"` returns `[]`.
- [ ] **Step 7: Launch decisions for the developer (not code):** confirm the project is not paused and choose a keep-alive ping or a paid plan; set the `SUPABASE_URL` / `SUPABASE_ANON_KEY` repository variables used by the release workflow; open the PR into `staging`. Ship as 0.7.0 in the release step, after 0.6.0.
