# Releasing tabIt

## Ordering hazard (read first)

`packaging/install.sh` pins `TABIT_REF` to the version written in the file on
`main`. If a version bump is merged before the matching GitHub release exists,
the installer cannot find the engine wheel and falls back to a git install, which
needs git. A fresh Mac without developer tools therefore cannot install until
the tag, the release and the engine wheel all exist. Tag and publish immediately
after merging.

## Checklist

1. Bump the version in every place below, together (one `X.Y.Z`; `vX.Y.Z` for
   the install.sh default). That is seven files holding eight literals, plus
   three test literals:
   - `pyproject.toml` (`version`)
   - `engine/__init__.py` (`__version__`)
   - `extension/manifest.json` (`version`)
   - `extension/package.json` (`version`)
   - `extension/package-lock.json` (both top-level `version` fields)
   - `packaging/install.sh` (`TABIT_REF` default, `vX.Y.Z`)
   - `.github/workflows/installer-e2e.yml` (the `"engineVersion":"..."`
     assertion)
   - the test literals: `RELEASE` in `tests/packaging/test_versions_match.py`
     (that test fails if any place above disagrees), the engine-version
     assertion in `tests/test_smoke.py` and the one in
     `tests/test_chord_backend.py` (`test_engine_version_is_the_package_version`)
2. Run the suites: `python -m pytest -q` and
   `cd extension && npx vitest run && npx tsc --noEmit`.
3. Merge to `main`.
4. Immediately tag the merge commit `vX.Y.Z` and push the tag.
5. `gh release create vX.Y.Z --title vX.Y.Z --notes "..."`.
6. Wait for the `Release extension` workflow (it builds the extension zip and
   the engine wheel and fails if the wheel version does not match the tag). To
   re-run it for an existing release, use "Run workflow" with the tag.
7. Confirm both assets are attached:
   `gh release view vX.Y.Z --json assets`
   - `tabit-extension-vX.Y.Z.zip`
   - `tabit_engine-X.Y.Z-py3-none-any.whl`
8. Smoke-test the public install command on a throwaway macOS user account.
9. (Owner) Upload the extension zip to the Chrome Web Store dashboard.

v1.1 will add the Setup app to this checklist.
