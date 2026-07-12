# tabIt helper — local packaging & distribution — design

**Date:** 2026-07-12
**Status:** approved
**Scope:** Phase 1 in full (one-line installer + launchd service + `tabit` CLI +
extension offline state); Phases 2–4 as roadmap context, each getting its own
spec later.

## Problem

Using tabIt today means cloning the repo, creating a Python 3.11 venv, running
a pip install with a build-constraint quirk, and manually keeping
`uvicorn api.main:app --port 8000` alive in a terminal. That is fine for the
author and hostile to everyone else. The end goal is a product a musician can
use: download an app, follow a guided setup, install the Chrome extension, and
it works — no terminal, ever.

Cloud hosting was explored and rejected for the analysis API:

- **YouTube blocks datacenter IPs.** `yt-dlp` from residential IPs works
  reliably; from cloud providers it hits bot checks. Workarounds (PO tokens,
  cookies, proxies) are a maintenance arms race.
- **Compute economics are inverted.** Users' Apple-Silicon Macs analyze a song
  in ~36 s for free; cloud CPU takes minutes and cloud GPU costs real money —
  paying to deliver a slower experience.
- **Cloud creates an abuse surface** (rate limits, spend caps) that local
  execution simply doesn't have.

Local-first keeps YouTube downloads on residential IPs, compute on the user's
GPU, and marginal cost at zero. The one weakness — install friction — is the
single problem this design attacks. A cloud component returns only in Phase 4,
as a tiny telemetry ingest endpoint with none of the above problems.

## Decision

Package the existing FastAPI server as the **tabIt helper**: a background
service on the user's Mac that the Chrome extension talks to over
`localhost:8000`, exactly as it does today. Ship it in phases, each removing
one category of friction while being usable on its own:

1. **Phase 1 (this spec):** one-line shell installer + launchd agent +
   `tabit` CLI + a friendly "helper isn't running" state in the extension.
   Audience: the author, friends, portfolio reviewers.
2. **Phase 2:** a signed, notarized menubar .app that bundles and supervises
   the server, with a first-run onboarding wizard (model download progress,
   guided extension install, "try it now"). Sparkle auto-updates. Audience:
   musicians.
3. **Phase 3:** publish the extension to the Chrome Web Store; add an
   extension↔helper version handshake on top of `/health`'s `engineVersion`.
4. **Phase 4:** observability — structured logs, a "report a problem"
   diagnostics bundle, and **opt-in** telemetry (installs, analysis outcomes
   with durations, song IDs/titles, chart summaries, errors) posted to a small
   ingest endpoint + dashboard, giving a real-world accuracy eval loop. Song
   titles and chords are listening-history-level personal data: consent is
   explicit during onboarding, copy is honest, and nothing is sent without it.

macOS only for now (Apple Silicon fast path; Intel supported with a "several
minutes per song" warning). Windows/Linux are out of scope for all phases in
this spec.

## Phase 1 architecture

Three units, each independently testable:

| Unit | What it does | Depends on |
|---|---|---|
| `packaging/install.sh` | provisions everything from one `curl \| sh` | uv, GitHub repo, network |
| `tabit` CLI (`packaging/cli.py`, console script) | status / logs / restart / warmup / uninstall | launchctl, the venv |
| extension offline state | detects a dead helper, tells the user how to fix it | existing `background/api.ts` |

### install.sh

Fetched via `curl -fsSL https://raw.githubusercontent.com/paolosand/tabIt/main/packaging/install.sh | sh`.
Idempotent: re-running upgrades in place. Steps, in order:

1. **Preflight.** macOS only (abort elsewhere); detect arm64 vs x86_64 and
   warn Intel users about CPU-only speed; check ~8 GB free disk (PyTorch +
   TensorFlow + model weights); check port 8000 — if something that isn't a
   tabIt helper already answers there, abort with a clear message (see Port
   below).
2. **uv.** Install via the official standalone installer if not present
   (`~/.local/bin/uv`); never touch system Python or Homebrew.
3. **Environment.** `~/Library/Application Support/tabIt/env`: uv-managed
   Python 3.11 venv; install the package from the public GitHub repo at a
   pinned tag (`git+https://github.com/paolosand/tabIt@<tag>` — the tag is a
   variable at the top of install.sh, bumped per release, so `curl | sh`
   always installs a known-good version) using uv's
   build-constraints support to mirror the documented
   `--build-constraint constraints-build.txt` invocation (fall back to the
   venv's own pip if uv's behavior diverges — the constraint quirk is
   crema's legacy setuptools build).
4. **Binaries.** `yt-dlp` comes from PyPI into the venv (it ships a console
   script; the engine invokes it via subprocess). `ffmpeg` is downloaded as a
   pinned static macOS build into `~/Library/Application Support/tabIt/bin`
   — no Homebrew dependency. The launchd plist puts both dirs on `PATH` so
   `engine/ingest.py`'s subprocess calls resolve without code changes.
5. **Model warmup.** Run `tabit warmup` to trigger every lazy first-use
   download (Demucs htdemucs weights, CREPE small, crema's bundled model) so
   the first real song pays no hidden download cost.
6. **Service.** Write `~/Library/LaunchAgents/com.tabit.helper.plist`
   (RunAtLoad + KeepAlive; env: `TABIT_CACHE_DIR`, `PATH`; stdout/err to
   `~/Library/Logs/tabIt/helper.log`) running the venv's
   `uvicorn api.main:app --port 8000`; `launchctl bootstrap` it.
7. **Verify.** Poll `/health` until it answers (bounded wait), then print
   "✓ tabIt helper running" plus the extension-setup link. Any failure exits
   nonzero with the failing step named; a rerun resumes safely.

### `tabit` CLI

New console entry point in `pyproject.toml` (kept separate from
`engine.cli`). Subcommands:

- `tabit status` — `/health` result + launchctl state + versions.
- `tabit logs [-f]` — tail `~/Library/Logs/tabIt/helper.log`.
- `tabit restart` / `tabit stop` / `tabit start` — via launchctl.
- `tabit warmup` — preload/download all models (used by the installer).
- `tabit uninstall` — unload + remove the agent, delete
  `Application Support/tabIt` (prompting about the chart cache), leave uv
  alone.

### File locations

| What | Where |
|---|---|
| venv + package | `~/Library/Application Support/tabIt/env` |
| ffmpeg | `~/Library/Application Support/tabIt/bin` |
| chart cache (`TABIT_CACHE_DIR`) | `~/Library/Application Support/tabIt/charts` |
| logs | `~/Library/Logs/tabIt/helper.log` |
| launchd agent | `~/Library/LaunchAgents/com.tabit.helper.plist` |

Repo-checkout workflows are unaffected: defaults (`data/charts`, port 8000,
foreground uvicorn) stay exactly as documented in the README.

### Port

The helper keeps **8000**, the extension's existing hardcoded `API_BASE`, so
Phase 1 requires no extension networking changes and the dev workflow is
identical to the helper workflow. Known tradeoff: 8000 is popular with
developers — exactly the Phase 1 audience. Mitigations now: the installer
aborts (never hijacks) when a foreign service owns the port, and `tabit
status` diagnoses "port 8000 is answering but it isn't tabIt." Moving to a
dedicated uncommon port is deferred to Phase 2, when onboarding can migrate
the extension and the app together.

### Extension: helper-offline state

New terminal bar variant alongside the existing error state:

- Health probe with a short timeout before/alongside chart requests; a
  network-level failure to reach `localhost:8000` (vs. an HTTP error from a
  live server) classifies as **helper offline**.
- Bar copy: "tabIt helper isn't running — open the app, or run `tabit
  restart` in a terminal." (Copy becomes "open tabIt from the menu bar" in
  Phase 2; the state machine is built once, here.)
- Background polling with backoff while offline; the bar recovers to its
  normal collapsed state automatically when `/health` answers.
- Mid-job death (poll of `/analyze/{job}` starts failing at the network
  level) lands in the same state rather than the generic error message.

### Error handling

- Installer: every step named in output; nonzero exit on failure; rerun-safe
  (each step checks before doing).
- Service: launchd `KeepAlive` restarts crashes; `ThrottleInterval` prevents
  crash-looping from pegging the machine.
- CLI: commands degrade gracefully when the agent was never installed
  (repo-checkout users get pointers, not stack traces).

### Testing

- `install.sh`: shellcheck in CI; a bats (or plain-sh) smoke test of the
  pure-logic pieces (preflight checks, plist rendering) with launchctl/network
  stubbed; one documented manual end-to-end run on a clean macOS user account
  per release.
- CLI: pytest with `launchctl`/HTTP mocked, same style as existing api tests.
- Extension: unit tests for the offline-classification logic (network error
  vs HTTP error) and the state transitions; the existing headful Playwright
  e2e gains a "helper down → bar shows offline state → helper up → recovers"
  scenario.

## Out of scope (Phase 1)

- Any GUI, menubar presence, signing, or notarization (Phase 2).
- Chrome Web Store packaging (Phase 3).
- Telemetry of any kind (Phase 4; nothing phones home in Phase 1).
- Windows/Linux; multiple concurrent helper versions; port migration.
