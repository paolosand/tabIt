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
