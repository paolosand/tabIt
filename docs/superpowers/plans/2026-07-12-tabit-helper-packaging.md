# tabIt Helper Packaging (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing FastAPI server as the "tabIt helper": a one-line macOS installer, a launchd background service, a `tabit` management CLI, and a friendly "helper isn't running" state in the Chrome extension.

**Architecture:** A new `helper/` Python package (paths, plist rendering, launchd ops, warmup, argparse CLI) ships inside the existing `tabit-engine` distribution, which gains explicit package discovery so non-editable git installs work. A thin `packaging/install.sh` provisions uv → Python 3.11 venv → the package → static ffmpeg → model warmup → launchd agent. The extension classifies network-level fetch failures as a new `offline` response and renders a dedicated bar state with exponential-backoff auto-recovery.

**Tech Stack:** Python 3.11 (stdlib only for `helper/`: argparse, plistlib, urllib, subprocess), POSIX sh, launchd, uv ≥0.7 (`--build-constraints`), TypeScript/React 19 + vitest for the extension.

**Spec:** `docs/superpowers/specs/2026-07-12-tabit-helper-packaging-design.md`

## Global Constraints

- macOS only; abort installer elsewhere. Apple Silicon (`arm64`) is the fast path; Intel (`x86_64`) supported with a "several minutes per song" note.
- Python `>=3.11,<3.12` (existing pyproject floor). The helper package uses **stdlib only** — no new runtime dependencies.
- Helper serves on port **8000**, host `127.0.0.1`. launchd label: **`com.tabit.helper`**.
- File locations (exact): venv `~/Library/Application Support/tabIt/env`; ffmpeg `~/Library/Application Support/tabIt/bin`; charts `~/Library/Application Support/tabIt/charts` (via `TABIT_CACHE_DIR`); logs `~/Library/Logs/tabIt/helper.log`; agent plist `~/Library/LaunchAgents/com.tabit.helper.plist`.
- ffmpeg static build pinned to `eugeneware/ffmpeg-static` release **b6.1.1** (assets `ffmpeg-darwin-arm64`, `ffmpeg-darwin-x64` — verified present).
- Repo-checkout dev workflows must not change: `data/charts` default cache dir, foreground `uvicorn api.main:app --port 8000`, existing pytest/vitest suites.
- Extension bar copy for the offline state (exact): `tabIt helper isn't running — open the app, or run tabit restart in a terminal.` (with `tabit restart` in a `<code>` element).
- Run Python tests with the repo venv: `source /Users/paolosandejas/Documents/PortfolioProjects/tabIt/.venv/bin/activate` first (worktree has no venv of its own; the suite needs the installed ML deps). Extension tests: `cd extension && npx vitest run`.
- Commit after every task (git working dir is the worktree, branch `worktree-packaging-deploy-exploration`).

---

### Task 1: Installable distribution — explicit packages + `tabit` console script

Today `top_level.txt` shows only `engine` ships in a non-editable install; `api` works only because the documented install is `-e`. Fix discovery, add the `helper` package skeleton and the `tabit` entry point.

**Files:**
- Modify: `pyproject.toml`
- Create: `helper/__init__.py`, `helper/cli.py`
- Test: `tests/helper/__init__.py`, `tests/helper/test_cli.py`

**Interfaces:**
- Produces: console script `tabit = helper.cli:main`; `helper.cli.main(argv: list[str] | None = None) -> int` (argparse; later tasks add subcommands to its `sub` subparsers object via `_register_*` functions).

- [ ] **Step 1: Write the failing test**

```python
# tests/helper/__init__.py  (empty file)
```

```python
# tests/helper/test_cli.py
import pytest

from helper.cli import main


def test_no_args_prints_help_and_exits_nonzero(capsys):
    assert main([]) == 2
    out = capsys.readouterr()
    assert "tabit" in (out.out + out.err)


def test_version_flag(capsys):
    with pytest.raises(SystemExit) as exc:
        main(["--version"])
    assert exc.value.code == 0
    from engine import __version__
    assert __version__ in capsys.readouterr().out
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/helper/test_cli.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'helper'`

- [ ] **Step 3: Write minimal implementation**

```python
# helper/__init__.py  (empty file)
```

```python
# helper/cli.py
"""`tabit` — manage the tabIt helper (the local analysis service).

Subcommands are registered by later modules; this module owns arg parsing
and dispatch. Stdlib only: the CLI must work in the helper venv without
pulling FastAPI into the import path.
"""
import argparse

from engine import __version__


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="tabit",
        description="Manage the tabIt helper (local chord-analysis service).",
    )
    parser.add_argument("--version", action="version", version=f"tabit {__version__}")
    parser.add_subparsers(dest="command")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command is None:
        parser.print_help()
        return 2
    return args.func(args)
```

In `pyproject.toml`, after the `[project.optional-dependencies]` table add:

```toml
[project.scripts]
tabit = "helper.cli:main"

[tool.setuptools.packages.find]
include = ["engine*", "api*", "helper*"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/helper/test_cli.py -v`
Expected: 2 passed

- [ ] **Step 5: Verify a non-editable install ships all three packages + the script**

```bash
uv venv --python 3.11 /tmp/tabit-pkg-check
uv pip install --python /tmp/tabit-pkg-check/bin/python --no-deps .
/tmp/tabit-pkg-check/bin/python -c "import engine, api, helper; print('packages ok')"
ls /tmp/tabit-pkg-check/bin/tabit
rm -rf /tmp/tabit-pkg-check
```

Expected: `packages ok` and the `tabit` script path printed. (`--no-deps` keeps this fast; `import api` is dependency-free because only `api.main` imports FastAPI.)

- [ ] **Step 6: Run the full Python suite to confirm nothing broke**

Run: `pytest`
Expected: all pass (same count as before the task, plus the 2 new)

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml helper/ tests/helper/
git commit -m "feat(helper): installable distribution — explicit packages, tabit CLI entry point"
```

---

### Task 2: `helper/paths.py` + launchd plist rendering

**Files:**
- Create: `helper/paths.py`, `helper/plist.py`
- Test: `tests/helper/test_plist.py`

**Interfaces:**
- Produces: `helper.paths` constants — `APP_SUPPORT`, `ENV_DIR`, `BIN_DIR`, `CHARTS_DIR`, `LOG_DIR`, `LOG_FILE`, `AGENT_LABEL`, `AGENT_PLIST` (all `pathlib.Path` except `AGENT_LABEL: str`), `PORT = 8000`, `HEALTH_URL: str`. `helper.plist.render_agent_plist() -> bytes`.
- Consumed by: Task 3 (`launchd.py` writes the plist), Task 4 (CLI reads paths).

- [ ] **Step 1: Write the failing test**

```python
# tests/helper/test_plist.py
import plistlib

from helper import paths
from helper.plist import render_agent_plist


def test_plist_roundtrips_with_agent_contract():
    data = plistlib.loads(render_agent_plist())
    assert data["Label"] == "com.tabit.helper"
    assert data["ProgramArguments"][0] == str(paths.ENV_DIR / "bin" / "uvicorn")
    assert data["ProgramArguments"][1:] == ["api.main:app", "--host", "127.0.0.1", "--port", "8000"]
    assert data["RunAtLoad"] is True
    assert data["KeepAlive"] is True
    assert data["ThrottleInterval"] == 15
    env = data["EnvironmentVariables"]
    assert env["TABIT_CACHE_DIR"] == str(paths.CHARTS_DIR)
    # subprocess calls to ffmpeg/yt-dlp resolve through this PATH
    assert str(paths.ENV_DIR / "bin") in env["PATH"]
    assert str(paths.BIN_DIR) in env["PATH"]
    assert data["StandardOutPath"] == str(paths.LOG_FILE)
    assert data["StandardErrorPath"] == str(paths.LOG_FILE)


def test_paths_land_in_macos_locations():
    assert str(paths.APP_SUPPORT).endswith("Library/Application Support/tabIt")
    assert str(paths.LOG_FILE).endswith("Library/Logs/tabIt/helper.log")
    assert str(paths.AGENT_PLIST).endswith("Library/LaunchAgents/com.tabit.helper.plist")
    assert paths.HEALTH_URL == "http://127.0.0.1:8000/health"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/helper/test_plist.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'helper.paths'`

- [ ] **Step 3: Write minimal implementation**

```python
# helper/paths.py
"""Canonical on-disk locations for an installed tabIt helper (macOS)."""
from pathlib import Path

APP_SUPPORT = Path.home() / "Library" / "Application Support" / "tabIt"
ENV_DIR = APP_SUPPORT / "env"
BIN_DIR = APP_SUPPORT / "bin"
CHARTS_DIR = APP_SUPPORT / "charts"
LOG_DIR = Path.home() / "Library" / "Logs" / "tabIt"
LOG_FILE = LOG_DIR / "helper.log"
AGENT_LABEL = "com.tabit.helper"
AGENT_PLIST = Path.home() / "Library" / "LaunchAgents" / f"{AGENT_LABEL}.plist"
PORT = 8000
HEALTH_URL = f"http://127.0.0.1:{PORT}/health"
```

```python
# helper/plist.py
"""Renders the launchd agent plist for the installed helper."""
import plistlib

from helper import paths


def render_agent_plist() -> bytes:
    data = {
        "Label": paths.AGENT_LABEL,
        "ProgramArguments": [
            str(paths.ENV_DIR / "bin" / "uvicorn"),
            "api.main:app", "--host", "127.0.0.1", "--port", str(paths.PORT),
        ],
        "RunAtLoad": True,
        "KeepAlive": True,
        # launchd relaunches crashes, but no more than once per 15s, so a
        # broken install can't crash-loop the machine.
        "ThrottleInterval": 15,
        "EnvironmentVariables": {
            "TABIT_CACHE_DIR": str(paths.CHARTS_DIR),
            # engine/ingest.py shells out to `ffmpeg` and `yt-dlp` by name.
            "PATH": f"{paths.ENV_DIR / 'bin'}:{paths.BIN_DIR}:/usr/bin:/bin",
        },
        "WorkingDirectory": str(paths.APP_SUPPORT),
        "StandardOutPath": str(paths.LOG_FILE),
        "StandardErrorPath": str(paths.LOG_FILE),
    }
    return plistlib.dumps(data)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/helper/test_plist.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add helper/paths.py helper/plist.py tests/helper/test_plist.py
git commit -m "feat(helper): macOS paths + launchd agent plist rendering"
```

---

### Task 3: `helper/launchd.py` — agent lifecycle operations

**Files:**
- Create: `helper/launchd.py`
- Test: `tests/helper/test_launchd.py`

**Interfaces:**
- Consumes: `helper.paths`, `helper.plist.render_agent_plist`.
- Produces: `is_loaded() -> bool`, `install_agent() -> None` (mkdirs, write plist, bootout-if-loaded, bootstrap; raises `RuntimeError` on bootstrap failure), `uninstall_agent() -> None`, `start() -> None` (bootstrap; raises `FileNotFoundError` if plist missing), `stop() -> None`, `restart() -> None` (kickstart -k if loaded else `start()`). All shell out to `launchctl` via `helper.launchd._run(args: list[str]) -> subprocess.CompletedProcess`.

- [ ] **Step 1: Write the failing test**

```python
# tests/helper/test_launchd.py
import subprocess
from types import SimpleNamespace

import pytest

from helper import launchd, paths


@pytest.fixture
def fake_home(tmp_path, monkeypatch):
    """Redirect every path constant into tmp_path so tests never touch ~."""
    monkeypatch.setattr(paths, "APP_SUPPORT", tmp_path / "AppSupport" / "tabIt")
    monkeypatch.setattr(paths, "ENV_DIR", tmp_path / "AppSupport" / "tabIt" / "env")
    monkeypatch.setattr(paths, "BIN_DIR", tmp_path / "AppSupport" / "tabIt" / "bin")
    monkeypatch.setattr(paths, "CHARTS_DIR", tmp_path / "AppSupport" / "tabIt" / "charts")
    monkeypatch.setattr(paths, "LOG_DIR", tmp_path / "Logs" / "tabIt")
    monkeypatch.setattr(paths, "LOG_FILE", tmp_path / "Logs" / "tabIt" / "helper.log")
    monkeypatch.setattr(paths, "AGENT_PLIST", tmp_path / "LaunchAgents" / "com.tabit.helper.plist")
    return tmp_path


class LaunchctlRecorder:
    """Stub for launchd._run: records calls, returns scripted results."""

    def __init__(self, loaded: bool = False):
        self.loaded = loaded
        self.calls: list[list[str]] = []

    def __call__(self, args: list[str]) -> SimpleNamespace:
        self.calls.append(args)
        if args[0] == "print":
            return SimpleNamespace(returncode=0 if self.loaded else 113, stderr="")
        return SimpleNamespace(returncode=0, stderr="")


def test_install_agent_writes_plist_and_bootstraps(fake_home, monkeypatch):
    rec = LaunchctlRecorder(loaded=False)
    monkeypatch.setattr(launchd, "_run", rec)
    launchd.install_agent()
    assert paths.AGENT_PLIST.exists()
    assert paths.CHARTS_DIR.is_dir() and paths.LOG_DIR.is_dir()
    assert ["bootstrap", launchd.gui_domain(), str(paths.AGENT_PLIST)] in rec.calls
    assert not any(c[0] == "bootout" for c in rec.calls)


def test_install_agent_reloads_when_already_loaded(fake_home, monkeypatch):
    rec = LaunchctlRecorder(loaded=True)
    monkeypatch.setattr(launchd, "_run", rec)
    launchd.install_agent()
    ops = [c[0] for c in rec.calls]
    assert ops.index("bootout") < ops.index("bootstrap")


def test_install_agent_raises_on_bootstrap_failure(fake_home, monkeypatch):
    def failing(args):
        if args[0] == "bootstrap":
            return SimpleNamespace(returncode=5, stderr="Bootstrap failed: 5")
        return SimpleNamespace(returncode=113, stderr="")
    monkeypatch.setattr(launchd, "_run", failing)
    with pytest.raises(RuntimeError, match="Bootstrap failed"):
        launchd.install_agent()


def test_uninstall_agent_removes_plist(fake_home, monkeypatch):
    rec = LaunchctlRecorder(loaded=True)
    monkeypatch.setattr(launchd, "_run", rec)
    paths.AGENT_PLIST.parent.mkdir(parents=True)
    paths.AGENT_PLIST.write_bytes(b"x")
    launchd.uninstall_agent()
    assert not paths.AGENT_PLIST.exists()
    assert any(c[0] == "bootout" for c in rec.calls)


def test_start_without_plist_raises(fake_home, monkeypatch):
    monkeypatch.setattr(launchd, "_run", LaunchctlRecorder())
    with pytest.raises(FileNotFoundError):
        launchd.start()


def test_restart_kickstarts_when_loaded(fake_home, monkeypatch):
    rec = LaunchctlRecorder(loaded=True)
    monkeypatch.setattr(launchd, "_run", rec)
    launchd.restart()
    assert ["kickstart", "-k", launchd.agent_target()] in rec.calls
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/helper/test_launchd.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'helper.launchd'`

- [ ] **Step 3: Write minimal implementation**

```python
# helper/launchd.py
"""launchctl operations for the com.tabit.helper agent."""
import os
import subprocess

from helper import paths
from helper.plist import render_agent_plist


def gui_domain() -> str:
    return f"gui/{os.getuid()}"


def agent_target() -> str:
    return f"{gui_domain()}/{paths.AGENT_LABEL}"


def _run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(["launchctl", *args], capture_output=True, text=True)


def is_loaded() -> bool:
    return _run(["print", agent_target()]).returncode == 0


def install_agent() -> None:
    for d in (paths.APP_SUPPORT, paths.BIN_DIR, paths.CHARTS_DIR, paths.LOG_DIR,
              paths.AGENT_PLIST.parent):
        d.mkdir(parents=True, exist_ok=True)
    paths.AGENT_PLIST.write_bytes(render_agent_plist())
    if is_loaded():
        _run(["bootout", agent_target()])
    res = _run(["bootstrap", gui_domain(), str(paths.AGENT_PLIST)])
    if res.returncode != 0:
        raise RuntimeError(f"launchctl bootstrap failed: {res.stderr.strip()}")


def uninstall_agent() -> None:
    if is_loaded():
        _run(["bootout", agent_target()])
    paths.AGENT_PLIST.unlink(missing_ok=True)


def start() -> None:
    if not paths.AGENT_PLIST.exists():
        raise FileNotFoundError(
            f"{paths.AGENT_PLIST} not found — run the installer (or `tabit install-agent`) first"
        )
    if not is_loaded():
        res = _run(["bootstrap", gui_domain(), str(paths.AGENT_PLIST)])
        if res.returncode != 0:
            raise RuntimeError(f"launchctl bootstrap failed: {res.stderr.strip()}")


def stop() -> None:
    if is_loaded():
        _run(["bootout", agent_target()])


def restart() -> None:
    if is_loaded():
        res = _run(["kickstart", "-k", agent_target()])
        if res.returncode != 0:
            raise RuntimeError(f"launchctl kickstart failed: {res.stderr.strip()}")
    else:
        start()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/helper/test_launchd.py -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add helper/launchd.py tests/helper/test_launchd.py
git commit -m "feat(helper): launchd agent lifecycle (install/uninstall/start/stop/restart)"
```

---

### Task 4: `tabit` CLI subcommands — status, logs, start/stop/restart, install-agent, uninstall

**Files:**
- Create: `helper/health.py`
- Modify: `helper/cli.py`
- Test: `tests/helper/test_health.py`, extend `tests/helper/test_cli.py`

**Interfaces:**
- Consumes: `helper.launchd` (Task 3 functions), `helper.paths`.
- Produces: `helper.health.check_health(timeout: float = 2.0) -> dict | None`, `helper.health.wait_for_health(timeout_s: float = 60.0) -> dict | None`; CLI subcommands `status`, `logs [-n N] [-f]`, `start`, `stop`, `restart`, `install-agent`, `uninstall [--purge]`. (`warmup` arrives in Task 5.)

- [ ] **Step 1: Write the failing tests**

```python
# tests/helper/test_health.py
import io
import urllib.error

from helper import health


def test_check_health_parses_ok(monkeypatch):
    class FakeResponse(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(
        health.urllib.request, "urlopen",
        lambda url, timeout: FakeResponse(b'{"status": "ok", "engineVersion": "0.2.1"}'),
    )
    assert health.check_health() == {"status": "ok", "engineVersion": "0.2.1"}


def test_check_health_none_when_unreachable(monkeypatch):
    def boom(url, timeout):
        raise urllib.error.URLError("refused")
    monkeypatch.setattr(health.urllib.request, "urlopen", boom)
    assert health.check_health() is None
```

Append to `tests/helper/test_cli.py`:

```python
from helper import health, launchd
from helper.cli import main as cli_main


def test_status_healthy(monkeypatch, capsys):
    monkeypatch.setattr(health, "check_health",
                        lambda **kw: {"status": "ok", "engineVersion": "0.2.1"})
    monkeypatch.setattr(launchd, "is_loaded", lambda: True)
    assert cli_main(["status"]) == 0
    out = capsys.readouterr().out
    assert "running" in out and "0.2.1" in out


def test_status_helper_down(monkeypatch, capsys):
    monkeypatch.setattr(health, "check_health", lambda **kw: None)
    monkeypatch.setattr(launchd, "is_loaded", lambda: False)
    assert cli_main(["status"]) == 1
    assert "not running" in capsys.readouterr().out


def test_status_foreign_service_on_port(monkeypatch, capsys):
    monkeypatch.setattr(health, "check_health", lambda **kw: {"whoami": "not-tabit"})
    monkeypatch.setattr(launchd, "is_loaded", lambda: False)
    assert cli_main(["status"]) == 1
    assert "isn't the tabIt helper" in capsys.readouterr().out


def test_restart_invokes_launchd(monkeypatch, capsys):
    called = []
    monkeypatch.setattr(launchd, "restart", lambda: called.append(True))
    monkeypatch.setattr(health, "wait_for_health",
                        lambda timeout_s=60.0: {"status": "ok", "engineVersion": "0.2.1"})
    assert cli_main(["restart"]) == 0
    assert called == [True]


def test_install_agent_waits_for_health(monkeypatch, capsys):
    monkeypatch.setattr(launchd, "install_agent", lambda: None)
    monkeypatch.setattr(health, "wait_for_health",
                        lambda timeout_s=60.0: {"status": "ok", "engineVersion": "0.2.1"})
    assert cli_main(["install-agent"]) == 0
    assert "✓" in capsys.readouterr().out


def test_install_agent_fails_when_health_never_answers(monkeypatch, capsys):
    monkeypatch.setattr(launchd, "install_agent", lambda: None)
    monkeypatch.setattr(health, "wait_for_health", lambda timeout_s=60.0: None)
    assert cli_main(["install-agent"]) == 1
    assert "tabit logs" in capsys.readouterr().out
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/helper/test_health.py tests/helper/test_cli.py -v`
Expected: FAIL — no module `helper.health`; CLI exits 2 (unknown command) for the new subcommands

- [ ] **Step 3: Write minimal implementation**

```python
# helper/health.py
"""Health probing for the local helper, stdlib-only."""
import json
import time
import urllib.error
import urllib.request

from helper import paths


def check_health(timeout: float = 2.0) -> dict | None:
    """GET /health; None when nothing (reachable) answers with JSON."""
    try:
        with urllib.request.urlopen(paths.HEALTH_URL, timeout=timeout) as res:
            return json.load(res)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None


def wait_for_health(timeout_s: float = 60.0) -> dict | None:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        found = check_health()
        if found is not None and "engineVersion" in found:
            return found
        time.sleep(1.0)
    return None
```

Rewrite `helper/cli.py` (keeping `build_parser`/`main` shape from Task 1):

```python
# helper/cli.py
"""`tabit` — manage the tabIt helper (the local analysis service).

Stdlib only: the CLI must work without pulling FastAPI into the import path.
Heavy imports (warmup) stay inside their subcommand functions.
"""
import argparse
import shutil
import subprocess
import sys

from engine import __version__
from helper import health, launchd, paths


def _cmd_status(args: argparse.Namespace) -> int:
    found = health.check_health()
    loaded = launchd.is_loaded()
    agent = "loaded" if loaded else ("installed but not loaded"
                                     if paths.AGENT_PLIST.exists() else "not installed")
    if found is not None and "engineVersion" in found:
        print(f"tabIt helper: running (engine {found['engineVersion']}) on port {paths.PORT}")
        print(f"launchd agent: {agent}")
        return 0
    if found is not None:
        print(f"port {paths.PORT} is answering but it isn't the tabIt helper — "
              "stop the other service and run `tabit restart`")
        return 1
    print(f"tabIt helper: not running (nothing on port {paths.PORT})")
    print(f"launchd agent: {agent}")
    if loaded:
        print("agent is loaded but not answering — check `tabit logs`")
    return 1


def _cmd_logs(args: argparse.Namespace) -> int:
    if not paths.LOG_FILE.exists():
        print(f"no log file yet at {paths.LOG_FILE}")
        return 1
    if args.follow:
        subprocess.run(["tail", "-f", str(paths.LOG_FILE)])
        return 0
    subprocess.run(["tail", "-n", str(args.lines), str(paths.LOG_FILE)])
    return 0


def _finish_start(verb: str) -> int:
    found = health.wait_for_health(timeout_s=60.0)
    if found is None:
        print(f"helper {verb} but /health never answered — check `tabit logs`")
        return 1
    print(f"✓ tabIt helper running (engine {found['engineVersion']})")
    return 0


def _cmd_start(args: argparse.Namespace) -> int:
    launchd.start()
    return _finish_start("started")


def _cmd_stop(args: argparse.Namespace) -> int:
    launchd.stop()
    print("tabIt helper stopped (it will not restart until `tabit start` or next login)")
    return 0


def _cmd_restart(args: argparse.Namespace) -> int:
    launchd.restart()
    return _finish_start("restarted")


def _cmd_install_agent(args: argparse.Namespace) -> int:
    launchd.install_agent()
    return _finish_start("installed")


def _cmd_warmup(args: argparse.Namespace) -> int:
    from helper.warmup import warm_all  # heavy ML imports live behind this
    warm_all(progress=print)
    return 0


def _cmd_uninstall(args: argparse.Namespace) -> int:
    launchd.uninstall_agent()
    print("launchd agent removed")
    for d in (paths.ENV_DIR, paths.BIN_DIR):
        if d.exists():
            shutil.rmtree(d)
            print(f"removed {d}")
    if paths.CHARTS_DIR.exists():
        if args.purge or input(
            f"delete the analyzed-chart cache at {paths.CHARTS_DIR}? [y/N] "
        ).strip().lower() == "y":
            shutil.rmtree(paths.CHARTS_DIR)
            print(f"removed {paths.CHARTS_DIR}")
        else:
            print(f"kept {paths.CHARTS_DIR}")
    print("tabIt helper uninstalled")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="tabit",
        description="Manage the tabIt helper (local chord-analysis service).",
    )
    parser.add_argument("--version", action="version", version=f"tabit {__version__}")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("status", help="is the helper running?").set_defaults(func=_cmd_status)

    logs = sub.add_parser("logs", help="show helper logs")
    logs.add_argument("-n", "--lines", type=int, default=100)
    logs.add_argument("-f", "--follow", action="store_true")
    logs.set_defaults(func=_cmd_logs)

    sub.add_parser("start", help="start the background service").set_defaults(func=_cmd_start)
    sub.add_parser("stop", help="stop the background service").set_defaults(func=_cmd_stop)
    sub.add_parser("restart", help="restart the background service").set_defaults(func=_cmd_restart)
    sub.add_parser("install-agent",
                   help="(re)install and start the launchd agent").set_defaults(func=_cmd_install_agent)
    sub.add_parser("warmup",
                   help="pre-download and load all models").set_defaults(func=_cmd_warmup)

    uninstall = sub.add_parser("uninstall", help="remove the helper from this Mac")
    uninstall.add_argument("--purge", action="store_true",
                           help="also delete the chart cache without asking")
    uninstall.set_defaults(func=_cmd_uninstall)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command is None:
        parser.print_help()
        return 2
    try:
        return args.func(args)
    except (RuntimeError, FileNotFoundError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/helper/ -v`
Expected: all pass (Task 1's two tests + 2 health + 6 CLI additions)

- [ ] **Step 5: Commit**

```bash
git add helper/health.py helper/cli.py tests/helper/
git commit -m "feat(helper): tabit status/logs/start/stop/restart/install-agent/uninstall"
```

---

### Task 5: `helper/warmup.py` + `api.main` reuses it

Warmup must both (a) surface failures when run from the CLI (the installer needs a nonzero exit) and (b) stay non-fatal inside the API's background thread. One raising core, two callers.

**Files:**
- Create: `helper/warmup.py`
- Modify: `api/main.py:34-50` (`_warm_models`)
- Test: `tests/helper/test_warmup.py`

**Interfaces:**
- Consumes: nothing from earlier tasks (lazy heavy imports).
- Produces: `helper.warmup.warm_all(progress: Callable[[str], object] = print, get_chord_model: Callable[[], object] | None = None) -> None` — raises on failure. `api.main._warm_models` keeps its existing signature/behavior (non-fatal, logs).

- [ ] **Step 1: Write the failing test**

```python
# tests/helper/test_warmup.py
import sys
import types

import pytest


@pytest.fixture
def stubbed_models(monkeypatch):
    """Stub every heavy import warm_all touches; record what loads."""
    loaded: list[str] = []

    crema = types.ModuleType("crema")
    crema_analyze = types.ModuleType("crema.analyze")
    crema.analyze = crema_analyze
    monkeypatch.setitem(sys.modules, "crema", crema)
    monkeypatch.setitem(sys.modules, "crema.analyze", crema_analyze)

    separate = types.ModuleType("engine.separate")
    separate._pick_device = lambda: "cpu"
    separate._get_separator = lambda name, device: loaded.append(f"demucs:{name}:{device}")
    monkeypatch.setitem(sys.modules, "engine.separate", separate)

    crepe = types.ModuleType("crepe")
    crepe_core = types.ModuleType("crepe.core")
    crepe_core.build_and_load_model = lambda size: loaded.append(f"crepe:{size}")
    crepe.core = crepe_core
    monkeypatch.setitem(sys.modules, "crepe", crepe)
    monkeypatch.setitem(sys.modules, "crepe.core", crepe_core)

    return loaded


def test_warm_all_loads_everything_in_order(stubbed_models):
    from helper.warmup import warm_all

    messages: list[str] = []
    warm_all(progress=messages.append,
             get_chord_model=lambda: stubbed_models.append("crema-chords"))
    assert stubbed_models == ["crema-chords", "demucs:htdemucs:cpu", "crepe:small"]
    assert any("crema" in m for m in messages)
    assert any("Demucs" in m for m in messages)
    assert any("CREPE" in m for m in messages)


def test_warm_all_propagates_failures(stubbed_models, monkeypatch):
    from helper.warmup import warm_all

    def broken(name, device):
        raise OSError("no space left on device")
    sys.modules["engine.separate"]._get_separator = broken
    with pytest.raises(OSError, match="no space"):
        warm_all(progress=lambda m: None, get_chord_model=lambda: None)


def test_api_warm_models_delegates_with_its_cached_model(monkeypatch):
    import api.main as api_main
    from helper import warmup

    captured: dict = {}

    def fake_warm_all(progress, get_chord_model):
        captured["get_chord_model"] = get_chord_model
    monkeypatch.setattr(warmup, "warm_all", fake_warm_all)
    api_main._warm_models()
    assert captured["get_chord_model"] is api_main._get_chord_model


def test_api_warm_models_stays_nonfatal(monkeypatch):
    import api.main as api_main
    from helper import warmup

    def boom(progress, get_chord_model):
        raise RuntimeError("download failed")
    monkeypatch.setattr(warmup, "warm_all", boom)
    api_main._warm_models()  # must not raise
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/helper/test_warmup.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'helper.warmup'`

- [ ] **Step 3: Write minimal implementation**

```python
# helper/warmup.py
"""Loads every model the pipeline needs, triggering their one-time weight
downloads, so the first analyzed song pays no hidden cost. Raises on failure —
the installer needs a nonzero exit; api.main wraps this non-fatally."""
from typing import Callable


def warm_all(progress: Callable[[str], object] = print,
             get_chord_model: Callable[[], object] | None = None) -> None:
    progress("loading chord model (crema)…")
    if get_chord_model is None:
        from engine.chords import CremaChordModel
        get_chord_model = CremaChordModel
    get_chord_model()
    import crema.analyze  # noqa: F401  (keras model builds at import)

    progress("loading source separator (Demucs htdemucs)…")
    from engine.separate import _get_separator, _pick_device
    _get_separator("htdemucs", _pick_device())

    progress("loading bass tracker (CREPE small)…")
    from crepe.core import build_and_load_model
    build_and_load_model("small")

    progress("all models ready")
```

Replace `api/main.py`'s `_warm_models` body (keep the docstring intent):

```python
def _warm_models() -> None:
    """Preload every model the pipeline needs so the first job doesn't pay
    import/model-load latency (~7s). Failures are non-fatal: the job path
    loads lazily anyway."""
    try:
        from helper.warmup import warm_all

        warm_all(progress=lambda m: logger.info("warmup: %s", m),
                 get_chord_model=_get_chord_model)
        logger.info("model warmup complete")
    except Exception:
        logger.warning("model warmup failed; models will load on first job",
                       exc_info=True)
```

(The direct `crema.analyze` / `engine.separate` / `crepe.core` imports leave `api/main.py`; `helper.warmup` owns them now.)

**Note for the implementer:** `test_warmup.py` stubs `sys.modules` entries, and `warm_all` passes `get_chord_model` explicitly in the api test, so no real ML model loads; the whole file runs in milliseconds.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/helper/test_warmup.py tests/api -v`
Expected: all pass (api tests confirm the refactor didn't break the app module)

- [ ] **Step 5: Commit**

```bash
git add helper/warmup.py api/main.py tests/helper/test_warmup.py
git commit -m "feat(helper): shared model warmup; api warmup delegates to it"
```

---

### Task 6: `packaging/install.sh`

**Files:**
- Create: `packaging/install.sh`

**Interfaces:**
- Consumes: `tabit warmup` and `tabit install-agent` (Tasks 4–5), the `[api]` extra, `constraints-build.txt` at repo root.
- Produces: the documented install command. Env overrides `TABIT_REPO` (git URL or `file:///abs/path`) and `TABIT_REF` (branch/tag) for development installs.

- [ ] **Step 1: Write the script**

```sh
#!/bin/sh
# tabIt helper installer — macOS only.
#
#   curl -fsSL https://raw.githubusercontent.com/paolosand/tabIt/main/packaging/install.sh | sh
#
# Idempotent: rerunning upgrades in place. Development overrides:
#   TABIT_REPO  git URL (or file:///abs/path) to install from
#   TABIT_REF   git ref to install (pin this to a release tag when publishing)
set -eu

TABIT_REPO="${TABIT_REPO:-https://github.com/paolosand/tabIt}"
TABIT_REF="${TABIT_REF:-main}"
FFMPEG_RELEASE="b6.1.1"

APP_SUPPORT="$HOME/Library/Application Support/tabIt"
ENV_DIR="$APP_SUPPORT/env"
BIN_DIR="$APP_SUPPORT/bin"
HEALTH_URL="http://127.0.0.1:8000/health"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

# --- preflight ---------------------------------------------------------------
[ "$(uname -s)" = Darwin ] || fail "the tabIt helper currently supports macOS only"
case "$(uname -m)" in
  arm64) FFMPEG_ARCH=arm64 ;;
  x86_64)
    FFMPEG_ARCH=x64
    printf 'note: Intel Mac detected — analysis runs on CPU (several minutes per song).\n' ;;
  *) fail "unsupported architecture: $(uname -m)" ;;
esac

avail_gb="$(df -g "$HOME" | awk 'NR==2 {print $4}')"
[ "$avail_gb" -ge 8 ] || fail "about 8 GB of free disk is needed (found ${avail_gb} GB free)"

if health="$(curl -sf --max-time 2 "$HEALTH_URL" 2>/dev/null)"; then
  case "$health" in
    *engineVersion*) printf 'existing tabIt helper found on port 8000 — upgrading in place.\n' ;;
    *) fail "port 8000 is in use by something that isn't the tabIt helper; stop it and rerun" ;;
  esac
elif curl -s --max-time 2 -o /dev/null "http://127.0.0.1:8000/"; then
  fail "port 8000 is in use by something that isn't the tabIt helper; stop it and rerun"
fi

# --- uv ----------------------------------------------------------------------
step "Checking for uv"
if command -v uv >/dev/null 2>&1; then
  UV="$(command -v uv)"
elif [ -x "$HOME/.local/bin/uv" ]; then
  UV="$HOME/.local/bin/uv"
else
  step "Installing uv (standalone; touches nothing outside ~/.local)"
  curl -fsSL https://astral.sh/uv/install.sh | sh
  UV="$HOME/.local/bin/uv"
  [ -x "$UV" ] || fail "uv install did not produce $UV"
fi

# --- python environment --------------------------------------------------------
step "Creating the Python 3.11 environment (first run downloads ~2 GB of wheels)"
mkdir -p "$APP_SUPPORT" "$BIN_DIR"
"$UV" venv --python 3.11 "$ENV_DIR"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
# crema's legacy build needs an old setuptools at *build* time — same
# constraint the README documents for dev installs.
case "$TABIT_REPO" in
  file://*) cp "${TABIT_REPO#file://}/constraints-build.txt" "$workdir/constraints-build.txt" ;;
  *) curl -fsSL "$TABIT_REPO/raw/$TABIT_REF/constraints-build.txt" \
       -o "$workdir/constraints-build.txt" ;;
esac

"$UV" pip install --python "$ENV_DIR/bin/python" \
  --build-constraints "$workdir/constraints-build.txt" \
  "tabit-engine[api] @ git+$TABIT_REPO@$TABIT_REF"

# --- ffmpeg --------------------------------------------------------------------
step "Installing ffmpeg (static build $FFMPEG_RELEASE)"
if [ ! -x "$BIN_DIR/ffmpeg" ]; then
  curl -fsSL -o "$BIN_DIR/ffmpeg" \
    "https://github.com/eugeneware/ffmpeg-static/releases/download/$FFMPEG_RELEASE/ffmpeg-darwin-$FFMPEG_ARCH"
  chmod +x "$BIN_DIR/ffmpeg"
fi
"$BIN_DIR/ffmpeg" -version >/dev/null 2>&1 || fail "downloaded ffmpeg does not run"

# --- models ---------------------------------------------------------------------
step "Downloading models (one-time; can take a few minutes)"
"$ENV_DIR/bin/tabit" warmup

# --- service --------------------------------------------------------------------
step "Installing the background service (starts at login, restarts on crash)"
"$ENV_DIR/bin/tabit" install-agent

# --- tabit on PATH ----------------------------------------------------------------
mkdir -p "$HOME/.local/bin"
ln -sf "$ENV_DIR/bin/tabit" "$HOME/.local/bin/tabit"
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) printf 'note: add ~/.local/bin to your PATH to call `tabit` directly.\n' ;;
esac

printf '\n\033[1m✓ tabIt helper installed and running.\033[0m\n'
printf 'Next: load the Chrome extension — see %s#readme\n' "$TABIT_REPO"
printf 'Manage it with: tabit status · tabit logs · tabit restart · tabit uninstall\n'
```

- [ ] **Step 2: Syntax-check and lint**

Run: `sh -n packaging/install.sh`
Expected: no output, exit 0

Run: `command -v shellcheck && shellcheck packaging/install.sh || echo "shellcheck unavailable — note it in the task report"`
Expected: no findings (SC2086-class quoting issues are the ones to actually fix; directives with justification are acceptable)

- [ ] **Step 3: Dry-check the preflight logic without installing**

Run each guard path in isolation:

```bash
# port-conflict branch: a fake non-tabIt service on 8000 must abort the script
python3 -m http.server 8000 & FAKE=$!
sh packaging/install.sh; echo "exit=$?"
kill $FAKE
```

Expected: `error: port 8000 is in use by something that isn't the tabIt helper…` and `exit=1`, printed *before* any uv/network work. (If the real dev API happens to be running instead, stop it first — the guard would classify it as an existing helper and continue.)

- [ ] **Step 4: Commit**

```bash
git add packaging/install.sh
git commit -m "feat(packaging): one-line macOS installer for the tabIt helper"
```

---

### Task 7: Extension — classify a dead helper as `offline`

**Files:**
- Modify: `extension/src/messages.ts`, `extension/src/background/handler.ts:52-54`
- Test: `extension/src/background/handler.test.ts` (one existing test **changes meaning**: line 60 "API unreachable -> error" becomes offline)

**Interfaces:**
- Produces: `GetChartResponse` gains `| { status: 'offline' }`. Task 8's UI consumes it.
- Classification rule: `fetch` rejects with `TypeError` on network-level failure (helper dead); HTTP errors from a live server are thrown as plain `Error("API <status>")` by `api.ts` and stay `error`.

- [ ] **Step 1: Update/write the failing tests**

In `extension/src/background/handler.test.ts`, **replace** the existing test `'API unreachable -> error response, not a throw'` with:

```ts
test('helper unreachable (network-level TypeError) -> offline, not error', async () => {
  (api.fetchCachedChart as Mock).mockRejectedValue(new TypeError('Failed to fetch'));
  const res = await handleGetChart('vid00000001');
  expect(res).toEqual({ status: 'offline' });
});

test('helper dying mid-job -> offline, and the job key clears so recovery resubmits', async () => {
  await chrome.storage.session.set({ 'job:vid00000001': 'job-1' });
  (api.pollJobOnce as Mock).mockRejectedValue(new TypeError('Failed to fetch'));
  const res = await handleGetChart('vid00000001');
  expect(res).toEqual({ status: 'offline' });
  const stored = await chrome.storage.session.get('job:vid00000001');
  expect(stored['job:vid00000001']).toBeUndefined();
});

test('HTTP error from a live server stays error, not offline', async () => {
  (api.fetchCachedChart as Mock).mockRejectedValue(new Error('API 500'));
  const res = await handleGetChart('vid00000001');
  expect(res.status).toBe('error');
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd extension && npx vitest run src/background/handler.test.ts`
Expected: the two offline tests FAIL (`status` is `'error'`); the HTTP-error test passes already

- [ ] **Step 3: Implement**

`extension/src/messages.ts`:

```ts
export type GetChartResponse =
  | { status: 'done'; chart: Chart }
  | { status: 'pending'; step?: string }
  | { status: 'offline' }
  | { status: 'error'; error: string };
```

`extension/src/background/handler.ts` — replace the final `catch` block:

```ts
  } catch (e) {
    // fetch rejects with TypeError on network-level failure: the local helper
    // isn't reachable at all — distinct from an HTTP error a live server sent
    // (api.ts throws those as plain Error('API <status>')).
    if (e instanceof TypeError) return { status: 'offline' };
    return { status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd extension && npx vitest run src/background/handler.test.ts`
Expected: all pass (including the untouched stale-job test — `Error('API 404')` still classifies as `error` with the job key cleared)

- [ ] **Step 5: Typecheck + full extension suite**

Run: `cd extension && npx tsc --noEmit && npx vitest run`
Expected: clean typecheck; all tests pass

- [ ] **Step 6: Commit**

```bash
git add extension/src/messages.ts extension/src/background/handler.ts extension/src/background/handler.test.ts
git commit -m "feat(ext): classify a dead helper as offline, distinct from server errors"
```

---

### Task 8: Extension — offline bar state with backoff auto-recovery

**Files:**
- Modify: `extension/src/overlay/App.tsx`, `extension/src/overlay/Bar.tsx`, `extension/src/overlay/styles.ts`
- Test: `extension/src/overlay/App.test.tsx`, `extension/src/overlay/Bar.test.tsx`

**Interfaces:**
- Consumes: `{ status: 'offline' }` responses (Task 7).
- Produces: `BarProps` gains `| { variant: 'offline'; onRetry: () => void }`; App `State` gains `{ kind: 'offline' }`. Backoff constants `OFFLINE_POLL_BASE_MS = 3000`, `OFFLINE_POLL_MAX_MS = 30000` (3s → 6s → 12s → 24s → 30s cap).

- [ ] **Step 1: Write the failing tests**

Append to `extension/src/overlay/Bar.test.tsx` (add `import userEvent from '@testing-library/user-event';` and `import { vi } from 'vitest';` at the top):

```tsx
test('offline variant explains the dead helper and offers retry', async () => {
  const onRetry = vi.fn();
  render(<Bar variant="offline" onRetry={onRetry} />);
  expect(screen.getByText(/helper isn't running/)).toBeInTheDocument();
  expect(screen.getByText('tabit restart')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /retry/i }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});
```

Append to `extension/src/overlay/App.test.tsx`:

```tsx
test('offline response shows the helper-offline bar, backs off, and auto-recovers', async () => {
  vi.useFakeTimers();
  const send = chrome.runtime.sendMessage as Mock;
  send
    .mockResolvedValueOnce({ status: 'offline' })
    .mockResolvedValueOnce({ status: 'offline' })
    .mockResolvedValueOnce({ status: 'done', chart: CHART });
  render(<App videoId="vid00000001" />);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.click(screen.getByRole('button', { name: /get chords/i }));

  await waitFor(() => expect(screen.getByText(/helper isn't running/)).toBeInTheDocument());

  // first retry fires at the 3s base delay…
  await vi.advanceTimersByTimeAsync(3100);
  expect(send).toHaveBeenCalledTimes(2);

  // …the second backs off to 6s: nothing at +3s…
  await vi.advanceTimersByTimeAsync(3100);
  expect(send).toHaveBeenCalledTimes(2);

  // …but fires by +6s, and the recovered helper's chart renders
  await vi.advanceTimersByTimeAsync(3000);
  await waitFor(() => expect(screen.getByText(/A major pentatonic/)).toBeInTheDocument());
  expect(send).toHaveBeenCalledTimes(3);
  vi.useRealTimers();
});

test('manual retry from the offline bar polls immediately', async () => {
  const send = chrome.runtime.sendMessage as Mock;
  send
    .mockResolvedValueOnce({ status: 'offline' })
    .mockResolvedValueOnce({ status: 'done', chart: CHART });
  render(<App videoId="vid00000001" />);
  await userEvent.click(screen.getByRole('button', { name: /get chords/i }));
  await waitFor(() => expect(screen.getByText(/helper isn't running/)).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /retry/i }));
  await waitFor(() => expect(screen.getByText(/A major pentatonic/)).toBeInTheDocument());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd extension && npx vitest run src/overlay/Bar.test.tsx src/overlay/App.test.tsx`
Expected: the three new tests FAIL (no offline variant; offline response currently falls into no branch)

- [ ] **Step 3: Implement**

`extension/src/overlay/Bar.tsx` — extend the union and add the branch before the final error return:

```ts
export type BarProps =
  | { variant: 'collapsed'; onGetChords: () => void }
  | { variant: 'loading'; step?: string }
  | { variant: 'offline'; onRetry: () => void }
  | { variant: 'error'; message: string; onRetry: () => void };
```

```tsx
  if (props.variant === 'offline') {
    return (
      <div className="tabit-bar tabit-bar-offline" data-state="offline">
        <Wordmark />
        <span className="tabit-offline-message">
          tabIt helper isn&apos;t running — open the app, or run <code>tabit restart</code> in
          a terminal.
        </span>
        <button
          type="button"
          className="tabit-btn tabit-btn-secondary"
          onClick={props.onRetry}
        >
          Retry
        </button>
      </div>
    );
  }
```

`extension/src/overlay/App.tsx`:

```ts
const POLL_INTERVAL_MS = 3000;
const OFFLINE_POLL_BASE_MS = 3000;
const OFFLINE_POLL_MAX_MS = 30000;

type State =
  | { kind: 'collapsed' }
  | { kind: 'loading'; step?: string }
  | { kind: 'sheet'; chart: Chart }
  | { kind: 'offline' }
  | { kind: 'error'; message: string };
```

Inside `App`, add a ref next to the existing ones (attempt count lives outside
state so StrictMode's double-invoked updaters can't double-schedule timers):

```ts
  // Consecutive offline polls, for backoff; any non-offline response resets it.
  const offlineAttemptRef = useRef(0);
```

Replace the `.then` body of `poll` with:

```ts
      .then((response: GetChartResponse) => {
        if (!aliveRef.current) return;
        if (response.status === 'offline') {
          const delay = Math.min(
            OFFLINE_POLL_BASE_MS * 2 ** offlineAttemptRef.current,
            OFFLINE_POLL_MAX_MS,
          );
          offlineAttemptRef.current += 1;
          setState({ kind: 'offline' });
          timerRef.current = setTimeout(poll, delay);
          return;
        }
        offlineAttemptRef.current = 0;
        if (response.status === 'done') {
          setState({ kind: 'sheet', chart: response.chart });
        } else if (response.status === 'error') {
          setState({ kind: 'error', message: response.error });
        } else {
          setState({ kind: 'loading', step: response.step });
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      })
```

Update `startPolling` so a manual retry clears the pending backoff timer and resets the attempt count:

```ts
  const startPolling = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    offlineAttemptRef.current = 0;
    setState({ kind: 'loading' });
    poll();
  }, [poll]);
```

Add the render case:

```tsx
    case 'offline':
      return <Bar variant="offline" onRetry={startPolling} />;
```

`extension/src/overlay/styles.ts` — next to the `.tabit-bar-error` rule add:

```css
.tabit-bar-offline .tabit-offline-message {
  font: 13px/1.4 var(--tabit-sans);
  color: var(--tabit-muted);
}
.tabit-bar-offline .tabit-offline-message code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--tabit-ink);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd extension && npx vitest run src/overlay/Bar.test.tsx src/overlay/App.test.tsx`
Expected: all pass, including the pre-existing App/Bar tests

- [ ] **Step 5: Typecheck, full suite, and build**

Run: `cd extension && npx tsc --noEmit && npx vitest run && npm run build`
Expected: clean typecheck, all tests pass, `dist/` builds

- [ ] **Step 6: Commit**

```bash
git add extension/src/overlay/ 
git commit -m "feat(ext): helper-offline bar state with backoff auto-recovery"
```

---

### Task 9: README — one-line install + helper management docs

**Files:**
- Modify: `README.md` (Quick start section and Roadmap)

- [ ] **Step 1: Add the install path**

Immediately after the existing "### 1. Engine + API" code block, add:

```markdown
#### Or: one-line install (macOS, beta)

Skip the manual environment entirely. The installer provisions Python 3.11
via [uv](https://docs.astral.sh/uv/), a static ffmpeg, and all model weights,
then runs the API as a background service that starts at login:

```bash
curl -fsSL https://raw.githubusercontent.com/paolosand/tabIt/main/packaging/install.sh | sh
```

Manage it with `tabit status` / `tabit logs` / `tabit restart` /
`tabit uninstall`. Charts cache to `~/Library/Application Support/tabIt/charts`,
logs to `~/Library/Logs/tabIt/helper.log`. If the helper is off, the extension
bar says so and recovers by itself once the service is back.
```

In the Roadmap section, insert above the Chrome Web Store line:

```markdown
- [x] macOS helper: one-line installer, launchd service, `tabit` CLI, extension offline state
```

- [ ] **Step 2: Verify the referenced commands exist**

Run: `grep -n "install.sh\|tabit status" README.md`
Expected: the new lines, with paths matching `packaging/install.sh`

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: one-line macOS helper install in quick start"
```

---

### Task 10: End-to-end verification on this machine

Real install, real launchd agent, real extension. This machine already has the dev deps, so wheel downloads are mostly cache hits. **Precondition:** stop any dev API on port 8000 first.

**Files:**
- None created (findings go in the PR body). Fix-forward any defects found, with tests, committed to the task that owns the code.

- [ ] **Step 1: Run the installer from the local repo state**

```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN   # must be empty; stop anything found
TABIT_REPO="file:///Users/paolosandejas/Documents/PortfolioProjects/tabIt" \
TABIT_REF="worktree-packaging-deploy-exploration" \
sh packaging/install.sh
```

(`file://` + branch ref: the main checkout shares refs with the worktree, so the branch is clonable from there. All tasks must be committed first.)

Expected: every step banner prints; ends with `✓ tabIt helper installed and running.`

- [ ] **Step 2: Verify the service surface**

```bash
curl -s http://127.0.0.1:8000/health   # {"status":"ok","engineVersion":"0.2.1"}
"$HOME/.local/bin/tabit" status        # running + agent loaded, exit 0
"$HOME/.local/bin/tabit" logs -n 20    # uvicorn startup lines
launchctl print "gui/$(id -u)/com.tabit.helper" | head -5
```

- [ ] **Step 3: Analyze a real song through the installed helper**

```bash
curl -s -X POST http://127.0.0.1:8000/analyze \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://www.youtube.com/watch?v=LanCLS_hIo4"}'
# poll until done (should pass through ingest/separate/chords steps):
curl -s http://127.0.0.1:8000/analyze/<jobId>
```

Expected: `pending` with advancing `step`, then `done` with a chart; confirms ffmpeg + yt-dlp resolve through the agent's PATH and models are warm. Record the wall-clock time for the PR.

- [ ] **Step 4: Verify crash recovery (launchd KeepAlive)**

```bash
PID=$(lsof -nP -tiTCP:8000 -sTCP:LISTEN); kill -9 "$PID"; sleep 20
curl -s http://127.0.0.1:8000/health
```

Expected: health answers again within ~20s without any manual action.

- [ ] **Step 5: Verify the extension offline → recover loop**

```bash
cd extension && npm run build
"$HOME/.local/bin/tabit" stop
```

Load `extension/dist` unpacked and open a YouTube video, click "♪ Get chords" → the bar must show "tabIt helper isn't running…". Then `tabit start` and wait ≤30s → the bar must recover on its own (no click). Prefer headful Playwright with the unpacked extension as done for the extension's original e2e; if Chrome ≥137 refuses `--load-extension` (known env quirk), do the check manually and record which method was used.

- [ ] **Step 6: Full test suites, one last sweep**

```bash
pytest && (cd extension && npx tsc --noEmit && npx vitest run)
```

Expected: everything green.

- [ ] **Step 7: Leave the helper installed** (it's the product, on the author's machine) and note `tabit uninstall --purge` in the PR as the escape hatch.

---

## Post-plan: PR

Push `worktree-packaging-deploy-exploration`, open a PR into `main` containing: the local-vs-cloud findings (YouTube datacenter blocking, compute economics, abuse surface), what was built per task, all test results including the e2e timings from Task 10, and next steps (tag a release + flip `TABIT_REF` default to the tag; Phase 2 menubar app spec; Chrome Web Store; opt-in telemetry design).
