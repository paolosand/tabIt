# tabIt

## Branching and releases

- `main` is always the **currently released** version (what is live on the Chrome Web
  Store and tagged on GitHub). Never commit, push, or merge to `main` unless the user
  explicitly tells you to for that specific change.
- `staging` is the integration branch for everything unreleased. Branch feature/fix
  work from `staging` and open PRs **into `staging`**, not `main`.
- A release is a deliberate step: version bump on `staging`, then a staging → `main` PR
  (merge commit, not squash, so the branches don't diverge), then tag and publish the
  GitHub release. Only do any of this when asked.
- Hotfix for a released version: branch from `main` (or the release tag), PR into
  `main` when told to, then merge `main` back into `staging`.
- Don't bump the version (`extension/manifest.json`, `extension/package.json`,
  `pyproject.toml`) as part of feature work; versions change only in the release step.
- Never move or reuse a published tag; if a release is bad, fix forward with the next
  patch version.

## Helper compatibility

Chrome updates the extension for everyone; the helper only changes when a user reruns the
installer. So a new extension must keep working with older helpers.

- The guarantee floor is helper **0.5.0**. Every released helper from there on keeps working.
- The helper API is **additive-only**: add fields or endpoints, never remove, rename or
  change the meaning of one that has shipped.
- The extension treats anything added after 0.5.0 as optional (feature-detect; fall back
  or hide the feature, never throw).
- `MIN_ENGINE_VERSION` (`extension/src/version.ts`) is the hard floor that shows the setup
  screen. Raise it only as a deliberate, stated decision in a PR.
- The guard is recorded fixtures in `tests/compat/fixtures/<version>/`: Python checks the
  current API is a superset of each, and `extension/src/compat.test.tsx` runs the real
  client code and Panel against each. At release time record the new version with
  `python -m tests.compat.record X.Y.Z` (from the repo root) and commit the result.
