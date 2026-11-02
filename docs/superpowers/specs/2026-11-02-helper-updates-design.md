# Helper updates and backwards compatibility

Status: draft, awaiting approval. Date: 2026-11-02.

## Intent

Chrome updates the extension for every user automatically. The helper (the local
engine installed by `install.sh`) is only ever updated when a user reruns the install
command. So after any release, many users run a new extension against an older helper.
We want that to keep working, and we want helper users to find out, calmly, when a newer
helper exists and have an easy way to take it.

## Goals

1. A new extension works with every helper from **0.5.0 onward** (the compatibility floor,
   decided by the owner: tabIt is only just shipping, so nobody is on anything older).
2. Users on an older helper see a short, dismissible notice that a newer helper is
   available, with the one-line command to update.
3. `tabit update` upgrades the helper from the terminal without the user needing to
   remember the original curl line.
4. CI fails before release if a change would break any supported helper version.

## Non-goals and anti-goals

- No silent or background self-update of the helper. It would mean downloading and running
  code unattended, which fights the "no tracking, sends nothing to the developer" promise
  and creates a supply-chain risk.
- No analytics, no phone-home. The extension decides whether the helper is old by comparing
  versions it already has; it makes no new network request.
- Not a goal: supporting helpers older than 0.5.0 (they get the existing setup screen).
- Failure to avoid: an update that leaves a user with a broken panel and no hint why.

## Design

### 1. Compatibility policy (the rule the rest depends on)

- **Additive-only API.** Helper responses may gain fields. Existing fields are never
  removed, renamed, or given a new meaning. New endpoints are fine; old ones keep working.
- **The extension feature-detects.** Any field or endpoint added after 0.5.0 is treated as
  optional by the extension: if absent, fall back or hide the feature. It never throws.
- **Two version constants in `extension/src/version.ts`:**
  - `MIN_ENGINE_VERSION` (hard floor, currently `0.4.0`): below it the existing setup
    screen shows. Raised only by a deliberate decision in a PR. Owner's guarantee floor is
    0.5.0; leaving the hard floor at 0.4.0 is my call (no reason to cut off anyone
    earlier than we promise), the builder may raise it to 0.5.0 if tests of 0.4.x break.
  - `RECOMMENDED_ENGINE_VERSION` (soft, new): below it the update notice shows. Bumped
    only when a release carries helper changes users should want. A release like 0.6.0,
    which changed only the extension, does not bump it, so users are not nagged for no gain.
- Written down in `CLAUDE.md` / the Development docs so future changes follow it.

### 2. Update notice in the panel

- Shown when the helper is `up`, not `tooOld`, and older than `RECOMMENDED_ENGINE_VERSION`.
- Content: "A newer helper is available" and the install command with a copy button. Quiet
  styling (a one-line strip in the panel footer area), not a blocking screen.
- Dismissible; the dismissal is remembered per helper version in `chrome.storage.local` and
  resets when the recommended version changes.
- No network access: pure comparison of `engineVersion` from `/health` with the constant.
- Copy follows `PRODUCT.md` voice; visuals follow `DESIGN.md`.

### 3. `tabit update`

- New subcommand in `helper/cli.py`. It reruns the installer from `main` (whose pinned
  `TABIT_REF` is always the latest release), which already upgrades in place and rolls back
  an interrupted swap.
- Prints what it is about to run and asks to confirm; `--yes` skips the prompt.
- The installer replaces the environment `tabit` itself runs from, so `update` must
  download the script to a temp file and hand over to it (exec), not pipe it from inside
  the running process. Builder to verify this on macOS.
- Reports the old and new version at the end, and says the extension picks the helper up
  on its next request.

### 4. Compatibility test

- Committed **response fixtures** per released helper version (recorded `/health` and
  analysis responses), in `tests/compat/fixtures/<version>/`.
- An extension test suite parses every fixture through the real client code and asserts the
  panel still renders and the update notice logic gives the right answer.
- The release workflow records fixtures for the new version so the window grows
  automatically; the policy keeps the last three minor versions plus the floor.
- My call, over spinning up old wheels in CI: wheels pull in the full ML dependencies and
  take minutes; fixtures catch the break that matters (response shape) in seconds.
- Gap to note: the `v0.5.0` release is an assetless dud, so there is no 0.5.0 wheel and
  0.5.0 never reached users. The earliest real fixture is 0.5.1; 0.5.0 is treated as
  equivalent.

## Constraints

- Extension changes ship through Web Store review (days), so they go out in a normal
  release, not as a hotfix. Helper changes ship via the release wheel.
- Branching policy: work on branches off `staging`, PRs into `staging`.
- Not part of the 0.6.0 submission already in review.

## Left to the builder

Exact wording and layout of the notice; `RECOMMENDED_ENGINE_VERSION` initial value (match
the helper version of the release that first ships this feature); how the fixture recorder
is invoked in the release workflow; tests for `tabit update` (dry-run mode is acceptable
so tests do not touch the real environment).

## Open decisions

None for the owner at this point. Calls marked "my call" above are mine and can be
overridden.
