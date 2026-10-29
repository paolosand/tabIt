# Development

How to run tabIt from source. For what each part does, see [How it works](HOW-IT-WORKS.md).

## Requirements

- macOS (the helper and installer are macOS only; the engine itself also runs in Linux CI)
- Python **3.11** (the package pins `>=3.11,<3.12`) and ffmpeg
- Node 20 for the extension and web app

## Engine and API

```bash
python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev,api]"
uvicorn api.main:app --port 28224
```

The helper uses port **28224** everywhere (the extension, the web app's dev proxy and the
launchd service), so a dev API on the same port stands in for it. Charts cache to
`data/charts/` in dev (override with `TABIT_CACHE_DIR`); the installed helper caches to
`~/Library/Application Support/tabIt/charts`. The first analysis downloads the 12 MB BTC
weights.

The engine also runs standalone:

```bash
python -m engine.cli <youtube-url|audio-file> -o chart.json
```

## Chrome extension

```bash
cd extension && npm install && npm run build
```

Load `extension/dist` at `chrome://extensions` (Developer mode, then Load unpacked). Rebuilding
does not refresh the running copy: reload the extension at `chrome://extensions` and refresh
the YouTube tab (YouTube is a single-page app, so an old tab keeps the old script).
Recent stable Chrome ignores `--load-extension` on the command line, so use the Load
unpacked button; automated tests need Playwright's bundled Chromium instead.

## Web app

```bash
cd web && npm install && npm run dev   # http://localhost:5173
```

With the API running, paste a YouTube URL or drop an audio file on the landing page. Vite
proxies `/api` to the helper on port 28224.

## Tests and CI

```bash
python -m pytest -q                                   # unit tests (integration tests are opt-in: -m integration)
cd extension && npx vitest run && npx tsc --noEmit    # extension
cd web && npm test && npm run build                   # web app
```

CI runs four jobs on every push and pull request: the Python suite on Ubuntu, the extension
(typecheck, tests, build), the web app (tests, typechecked build) and the installer
(`sh -n` and shellcheck). A separate job (`installer-e2e`) runs `install.sh`, a health
check and `uninstall --purge` on a clean macOS runner. `release-extension` builds the
extension zip and the engine wheel when a release is published.

## Helper development installs

`packaging/install.sh` installs the pinned release by default. To install from a checkout
or another ref:

```bash
TABIT_REPO=file:///path/to/tabIt TABIT_REF=my-branch sh packaging/install.sh
```

Manage the installed helper with `~/.local/bin/tabit status | logs | start | stop | restart | warmup | uninstall`.

## Benchmarks

`python -m benchmarks.chord_accuracy` scores the engine against hand-labeled Isophonics
annotations. It is local-only, because yt-dlp is blocked from datacenter IPs. See
[`benchmarks/README.md`](../benchmarks/README.md).

## Project layout

```
engine/      Python MIR pipeline: audio in, chart JSON out (BTC vendored in engine/vendor/btc)
api/         FastAPI wrapper: analyze endpoints, job store, disk cache, local-only guard
helper/      macOS helper: launchd service, `tabit` CLI, health checks
packaging/   one-line installer and Web Store art
extension/   Chrome MV3 extension: the beat ribbon overlaid on youtube.com
web/         Vite + React app: player + synced per-beat chord grid
benchmarks/  chord-accuracy benchmark and results
tests/       Python tests
data/charts/ dev chart cache (videoId @ engine version)
docs/        this documentation, design specs, plans, brand assets, store listing
```

## Branching and releases

- **`main`** is always the currently released version: what is live on the Chrome Web Store
  and tagged on GitHub.
- **`staging`** is the integration branch for everything unreleased. Branch feature and fix
  work from `staging` and open pull requests into it.
- A release is a deliberate step: bump the version on `staging`, open a `staging` → `main`
  pull request (a merge commit, not a squash, so the branches don't diverge), then tag and
  publish. [`RELEASING.md`](RELEASING.md) has the checklist.
- A hotfix for a released version branches from `main`, goes into `main`, and is then
  merged back into `staging`. Docs-only changes that describe the released version, like
  the README, can go straight to `main` the same way.
- Versions change only in the release step, never as part of feature work, and a published
  tag is never moved: a bad release is fixed forward with the next patch version.

## More

- [`RELEASING.md`](RELEASING.md): version bumps, tagging and publishing a release
- [`DESIGN.md`](../DESIGN.md) and [`PRODUCT.md`](../PRODUCT.md): the brand and the product's intent
- [`docs/superpowers/`](superpowers/): design specs and implementation plans
