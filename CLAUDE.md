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
