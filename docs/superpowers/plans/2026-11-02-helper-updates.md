# Helper updates and backwards compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every new extension working with every helper from 0.5.0 onward, tell users on an older helper that an update exists, and give them `tabit update`.

**Architecture:** A compatibility guard first (recorded response fixtures per released helper, a Python test that the current API is a superset of every fixture, an extension test that the real client code and Panel handle every fixture). Then `tabit update` in the stdlib-only helper CLI. Then the panel notice, driven by a new soft `RECOMMENDED_ENGINE_VERSION` that sits beside the existing hard `MIN_ENGINE_VERSION`; the background worker owns the "dismissed" state.

**Tech Stack:** Python 3.11 (argparse, pytest, FastAPI TestClient), TypeScript + React + vitest (extension), GitHub Actions unchanged.

**Spec:** `docs/superpowers/specs/2026-11-02-helper-updates-design.md` (approved mock: `docs/superpowers/specs/assets/update-notice-mock.html`)

## Global Constraints

- Compatibility floor is helper **0.5.0**; `MIN_ENGINE_VERSION` stays `'0.4.0'` (owner's guarantee is 0.5.0, the hard floor is deliberately not raised).
- Helper API changes are **additive-only**: fields are never removed, renamed or re-meant; the extension treats anything added after 0.5.0 as optional.
- The panel notice makes **no network request**; it compares `engineVersion` from `/health` with a constant.
- No silent or background helper self-update. `tabit update` always shows what it will run and asks first unless `--yes`.
- `helper/cli.py` stays **stdlib only** (no FastAPI/requests in its import path).
- Amber is reserved for progress: the notice uses ink and paper only. No em dashes in user-facing copy.
- The single install command is `INSTALL_COMMAND` in `extension/src/install.ts`; do not retype it elsewhere in the extension.
- Branching: one branch per task off `staging`, PRs `--base staging`. Never push or merge to `main`. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Not part of the 0.6.0 Web Store submission; this ships in a later release.

## Review Focus

1. Helper reports an unparseable `engineVersion` (`"unknown"`, `"0.6.0.dev1"`): no update notice and no `tooOld` (pinned in Task 3 handler tests).
2. `chrome.storage.local` throws on read or write: a read failure means "not dismissed" and the notice still shows; a write failure never throws into the UI (Task 3).
3. A helper newer than the extension's `RECOMMENDED_ENGINE_VERSION`: no notice (Task 3).
4. `tabit update` with no network or an HTTP error: clear message, exit code 1, nothing executed, existing helper untouched (Task 2).
5. `tabit update` with non-interactive stdin and no `--yes`: aborts with exit 1, never proceeds (Task 2).
6. A newer helper response that gains unknown fields: the extension ignores them (Task 1).

---

## File Structure

| Path | Responsibility |
|---|---|
| `tests/compat/record.py` | Builds the API's recorded responses in-process; writes a fixture directory for a version |
| `tests/compat/fixtures/<version>/*.json` | Frozen responses of released helpers (`health`, `analyze-submit`, `job-pending`, `job-done`, `chart`) |
| `tests/compat/test_compat.py` | Additive-only guard and fixture-presence guard |
| `extension/src/compat.test.ts` | Real client code and Panel run against every fixture |
| `helper/cli.py` | `tabit update` subcommand |
| `extension/src/version.ts` | `RECOMMENDED_ENGINE_VERSION` |
| `extension/src/messages.ts`, `background/handler.ts`, `background/index.ts` | `updateAvailable` in the status response; `DISMISS_UPDATE_NOTICE` message |
| `extension/src/overlay/UpdateNote.tsx`, `copy.ts`, `styles.ts`, `App.tsx` | The notice component, strings, styles, wiring |
| `CLAUDE.md`, `docs/DEVELOPMENT.md`, `docs/RELEASING.md` | The policy and the release checklist additions |

---

### Task 1: Compatibility guard and policy (PR 1)

**Branch:** `feat/compat-guard` off `staging`.

**Files:**
- Create: `tests/compat/__init__.py`, `tests/compat/record.py`, `tests/compat/test_compat.py`, `tests/compat/fixtures/0.5.1/*.json`, `tests/compat/fixtures/0.6.0/*.json`, `extension/src/compat.test.ts`
- Modify: `CLAUDE.md`, `docs/DEVELOPMENT.md`, `docs/RELEASING.md`

**Interfaces:**
- Produces: `tests/compat/record.py::build_responses() -> dict[str, object]` with exactly the keys `health`, `analyze-submit`, `job-pending`, `job-done`, `chart` (each value the JSON body the API returns); `record.py` run as `python tests/compat/record.py <version>` writes `tests/compat/fixtures/<version>/<key>.json`. Fixture directory names are plain versions (`0.5.1`).

- [ ] **Step 1: Write the failing tests** in `tests/compat/test_compat.py`:
  - `test_current_api_is_superset_of_every_fixture`: for each fixture directory, every key path in each fixture exists in `build_responses()[name]` (recurse into dicts; for lists compare the first element's key paths; values are ignored). A helper `key_paths(obj) -> set[str]` does the walk.
  - `test_floor_fixture_exists`: `tests/compat/fixtures/0.5.1` exists (0.5.0 never reached users and its release has no wheel; 0.5.1 is the earliest real fixture).
  - `test_current_version_has_fixtures`: a fixture directory named `engine.__version__` exists, so a version bump cannot be released without recording.
  - `test_key_paths_detects_a_removed_field` (guards the guard): `key_paths({"a": {"b": 1}}) - key_paths({"a": {}})` is `{"a.b"}`.
- [ ] **Step 2: Run** `python -m pytest tests/compat -q`. Expected: FAIL (module and fixtures missing).
- [ ] **Step 3: Implement `build_responses()` in `tests/compat/record.py`.** Use FastAPI `TestClient(app, base_url="http://localhost:28224")` with `_run_analysis` stubbed to return `FAKE_CHART`, the same technique as the analyze-and-poll test in `tests/api/test_main.py` (reuse its `FAKE_CHART`; copy it rather than importing from a test module). `job-pending` is the response of `GET /analyze/{id}` before the stub finishes (hold the stub on a `threading.Event`), `job-done` after, `chart` is `GET /chart/{videoId}`. `main(version)` writes the pretty-printed JSON files (2-space indent, sorted keys).
- [ ] **Step 4: Record the fixtures.** For 0.6.0 run `python tests/compat/record.py 0.6.0` on the current tree. For 0.5.1 run it against the tag's source: `git worktree add /tmp/tabit-0.5.1 v0.5.1`, then `PYTHONPATH=/tmp/tabit-0.5.1 python tests/compat/record.py 0.5.1`, then `git worktree remove /tmp/tabit-0.5.1`. Check that `fixtures/0.5.1/health.json` says `"engineVersion": "0.5.1"`; if the dev environment's installed package wins over `PYTHONPATH`, record from a throwaway venv built from the v0.5.1 wheel instead.
- [ ] **Step 5: Run** `python -m pytest tests/compat -q`. Expected: PASS.
- [ ] **Step 6: Write the failing extension test** `extension/src/compat.test.ts`. It reads every directory in `../../tests/compat/fixtures` and, per version, with `fetch` mocked to serve the fixture bodies:
  - `getHelperStatus()` resolves `{ state: 'up', engineVersion: <that version> }`.
  - `handleGetHelperStatus()` returns `tooOld: false` for every fixture version (all are at or above the floor).
  - `fetchCachedChart`, `submitAnalysis` (returns the fixture's `jobId`), and `pollJobOnce` (both pending and done) return the fixture bodies.
  - Rendering `<Panel chart={fixture.chart} onCollapse={() => {}} />` with testing-library does not throw and shows the first chord's label.
  - `test_unknown_fields_are_ignored`: the same checks pass when the `health` and `chart` fixtures gain extra top-level and nested fields (`{ ...body, futureField: 1 }`).
- [ ] **Step 7: Run** `cd extension && npx vitest run src/compat.test.ts`. Expected: PASS (the fixtures exist from Step 4; to watch it fail first, run it before recording). Fix any real incompatibility the test finds in the client code (none expected).
- [ ] **Step 8: Write the policy.** Add a "Helper compatibility" section to `CLAUDE.md` and `docs/DEVELOPMENT.md` stating: floor 0.5.0; additive-only API; extension feature-detects anything added after 0.5.0; `MIN_ENGINE_VERSION` raised only by a deliberate PR decision; fixtures are the guard (what they are, where they live). In `docs/RELEASING.md` add checklist step: "Record fixtures for the new version: `python tests/compat/record.py X.Y.Z`, commit them. `tests/compat/test_compat.py` fails until you do."
- [ ] **Step 9: Run the full suites** (`python -m pytest -q`, `cd extension && npx vitest run && npx tsc --noEmit`). Expected: PASS.
- [ ] **Step 10: Commit and open the PR** (`gh pr create --base staging`).

---

### Task 2: `tabit update` (PR 2)

**Branch:** `feat/tabit-update` off `staging`. Independent of Task 1.

**Files:**
- Modify: `helper/cli.py`, `tests/helper/test_cli.py`, and the docs page that lists the `tabit` subcommands (find with `grep -rn "tabit restart" README.md docs`)

**Interfaces:**
- Produces in `helper/cli.py`: `INSTALL_SCRIPT_URL: str = "https://raw.githubusercontent.com/paolosand/tabIt/main/packaging/install.sh"`; `_download_script(url: str) -> str` (writes the script to a `tempfile.mkstemp` file and returns its path; raises `RuntimeError` with a readable message on any network or HTTP failure); `_cmd_update(args) -> int`; subcommand `update` with flags `--yes` and `--dry-run`.

- [ ] **Step 1: Write the failing tests** in `tests/helper/test_cli.py` (follow that file's existing style):
  - `test_update_dry_run_prints_url_and_runs_nothing`: `main(["update", "--dry-run"])` returns 0, output contains `INSTALL_SCRIPT_URL`, and `_download_script` and `os.execv` are never called (monkeypatch both to raise).
  - `test_update_declined_does_not_download`: `input` returns `"n"`; returns 1; `_download_script` not called.
  - `test_update_non_interactive_without_yes_aborts`: `input` raises `EOFError`; returns 1; nothing downloaded or executed. (Review Focus 5)
  - `test_update_yes_downloads_then_execs_installer`: with `--yes`, `_download_script` is monkeypatched to return `"/tmp/x.sh"`, `os.execv` to a recorder; asserts `execv("/bin/sh", ["sh", "-c", <wrapper>, "/tmp/x.sh"])` where the wrapper runs `sh "$0"`, keeps its exit status, and removes `$0`.
  - `test_update_download_failure_exits_1_without_exec`: `_download_script` raises `RuntimeError("no network")`; `main` returns 1, stderr contains `no network`, `os.execv` not called. (Review Focus 4)
  - `test_update_prints_current_version`: output contains `__version__` before the prompt.
- [ ] **Step 2: Run** `python -m pytest tests/helper/test_cli.py -q -k update`. Expected: FAIL (no `update` subcommand).
- [ ] **Step 3: Implement** `_download_script` with `urllib.request.urlopen` (timeout 30s, scheme must be https, size capped at 1 MB) and `_cmd_update`: print current version and the URL, then (unless `--dry-run`, which stops there with exit 0) ask `Run the installer from <url>? [y/N]` unless `--yes`, download, `os.execv` the `sh -c` wrapper so the installer is not a child of a process running inside the environment it replaces. Register the subparser next to `uninstall`. `RuntimeError` already maps to exit 1 in `main`.
- [ ] **Step 4: Run** `python -m pytest tests/helper tests/packaging -q`. Expected: PASS.
- [ ] **Step 5: Document** the subcommand where the others are listed; one sentence: it reruns the installer from `main`, whose pinned `TABIT_REF` is the latest release (so it inherits the ordering hazard in `docs/RELEASING.md`).
- [ ] **Step 6: Manual check on macOS** (not automated; note the result in the PR): `tabit update --dry-run` prints the plan; on a throwaway or the dev machine `tabit update --yes` upgrades in place and `tabit status` reports the new engine version. Confirm the upgrade survives running from the environment it replaces.
- [ ] **Step 7: Commit and open the PR** (`--base staging`).

---

### Task 3: Update notice in the panel (PR 3)

**Branch:** `feat/update-notice` off `staging`. Best merged after Task 1 so the compatibility tests cover the new status field.

**Files:**
- Modify: `extension/src/version.ts`, `extension/src/messages.ts`, `extension/src/background/handler.ts`, `extension/src/background/index.ts`, `extension/src/overlay/App.tsx`, `extension/src/overlay/copy.ts`, `extension/src/overlay/styles.ts`, `docs/RELEASING.md`, plus the matching `*.test.ts(x)` files
- Create: `extension/src/overlay/UpdateNote.tsx`, `extension/src/overlay/UpdateNote.test.tsx`

**Interfaces:**
- Produces in `version.ts`: `export const RECOMMENDED_ENGINE_VERSION = '0.6.0'` (bump only when a release carries helper changes users should want; set it to that release's version in that release's PR).
- Produces in `messages.ts`: `HelperStatusResponse` becomes `{ state: 'up'; tooOld: boolean; updateAvailable: boolean } | { state: 'down'; everSeen: boolean }`; new `export interface DismissUpdateNoticeRequest { type: 'DISMISS_UPDATE_NOTICE'; }`.
- Produces in `handler.ts`: `handleDismissUpdateNotice(): Promise<void>` (stores `updateNoticeDismissed: RECOMMENDED_ENGINE_VERSION` in `chrome.storage.local`, never throws).
- Produces in `UpdateNote.tsx`: `export function UpdateNote(props: { onCopy: () => Promise<boolean>; onDismiss: () => void }): JSX.Element`.
- Produces in `copy.ts`: `UPDATE_NOTICE = 'A newer helper is available'`, `COPY_UPDATE_COMMAND = 'Copy update command'`, `PASTE_IN_TERMINAL = 'Paste it in Terminal, press Return'`, `DISMISS_LABEL = 'Dismiss'` (reuses the existing `COPIED_LABEL` and `COPY_FALLBACK`).

- [ ] **Step 1: Write the failing handler tests** (`handler.test.ts`, existing mocking style): `updateAvailable` is true when the helper is `0.5.1` and the constant is `0.6.0`; false at `0.6.0`; false when newer (`0.9.0`, Review Focus 3); false and `tooOld` false for `"unknown"` and `"0.6.0.dev1"`-style input (Review Focus 1, `isOlderThan` already treats unparseable as not older); false once `updateNoticeDismissed === '0.6.0'`; true again if the stored value is an older version; true when `chrome.storage.local.get` throws (Review Focus 2); `handleDismissUpdateNotice` swallows a throwing `set` (Review Focus 2). A `tooOld` helper reports `updateAvailable: false` (the setup bar takes over).
- [ ] **Step 2: Run** `cd extension && npx vitest run src/background`. Expected: FAIL.
- [ ] **Step 3: Implement** the constant, the response field, `handleGetHelperStatus` (`updateAvailable = !tooOld && isOlderThan(version, RECOMMENDED_ENGINE_VERSION) && !dismissed`), `handleDismissUpdateNotice`, and the `DISMISS_UPDATE_NOTICE` case in the background message listener beside `GET_HELPER_STATUS`. Update `messages.test.ts` for the new union member. Run the background tests: PASS.
- [ ] **Step 4: Write the failing component tests** (`UpdateNote.test.tsx`): renders `UPDATE_NOTICE`, a `COPY_UPDATE_COMMAND` button and a dismiss button labelled `DISMISS_LABEL`; clicking copy calls `onCopy` and, on `true`, shows `PASTE_IN_TERMINAL` and the `COPIED_LABEL` button; on `false` shows `<code>` containing `INSTALL_COMMAND` and `COPY_FALLBACK` and hides the copy button; clicking dismiss calls `onDismiss`; the region has `aria-label="Helper update"`.
- [ ] **Step 5: Implement `UpdateNote`** to match the approved mock exactly (state: `'idle' | 'copied' | 'fallback'`), add the strings to `copy.ts`, and port the mock's `.tabit-update-note*` rules into `styles.ts` using the existing `--tabit-*` variables (`--tabit-wash` does not exist yet in `styles.ts`; add it as `oklch(0.94 0.01 85)` to the same `:host` block). Keep the reduced-motion rule. Run the component tests: PASS.
- [ ] **Step 6: Wire into `App.tsx`.** Track `updateAvailable` in component state, set from the status response in `checkStatus` when `response.state === 'up'`. Render `<UpdateNote>` above the bar only when `updateAvailable` and the state kind is `collapsed` or `sheet` (never setup, offline, loading, error, unsupported). `onCopy` is `() => copyText(INSTALL_COMMAND)`; `onDismiss` hides the strip immediately in state and sends `DISMISS_UPDATE_NOTICE`. Add `App.test.tsx` cases for: shown on collapsed; shown on sheet; hidden on setup; hidden after dismiss and the message was sent.
- [ ] **Step 7: Docs.** In `docs/RELEASING.md` add: "Decide whether this release carries helper changes users should want; if so set `RECOMMENDED_ENGINE_VERSION` in `extension/src/version.ts` to this version."
- [ ] **Step 8: Run** `cd extension && npx vitest run && npx tsc --noEmit && npm run build`, then `python -m pytest -q`. Expected: PASS.
- [ ] **Step 9: Verify in a browser.** Load the built extension, point it at a helper reporting a lower version (temporary local override of the constant is fine), and check the strip on a YouTube page: appears, copy puts the install command on the clipboard, dismiss hides it and it stays hidden after reload. Note the result in the PR.
- [ ] **Step 10: Commit and open the PR** (`--base staging`).

---

## Self-review notes

- Spec coverage: policy and constants (Task 1 doc step, Task 3), notice (Task 3), `tabit update` (Task 2), fixture guard (Task 1), release-checklist hooks (Tasks 1 and 3). The spec says the release workflow records fixtures; the plan instead makes recording a checklist step enforced by `test_current_version_has_fixtures`, which fails CI until it is done (my call: simpler and cannot be skipped).
- The spec says `tabit update` reports old and new versions. The installer already prints the installed engine version at the end, so the command prints the current version before the prompt and leaves the new version to the installer (my call).
- `RECOMMENDED_ENGINE_VERSION` starts at `'0.6.0'` so no current user sees a notice until a release deliberately raises it.
