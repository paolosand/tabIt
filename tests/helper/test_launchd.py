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
