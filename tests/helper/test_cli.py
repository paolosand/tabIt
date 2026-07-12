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


def test_logs_follow_swallows_keyboard_interrupt(tmp_path, monkeypatch, capsys):
    from helper import paths

    log_file = tmp_path / "helper.log"
    log_file.write_text("hello\n")
    monkeypatch.setattr(paths, "LOG_FILE", log_file)

    import subprocess as subprocess_module

    def raise_interrupt(*args, **kwargs):
        raise KeyboardInterrupt

    monkeypatch.setattr(subprocess_module, "run", raise_interrupt)

    assert cli_main(["logs", "-f"]) == 0


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


def test_uninstall_keeps_charts_when_stdin_closed(tmp_path, monkeypatch, capsys):
    from helper import paths

    monkeypatch.setattr(paths, "APP_SUPPORT", tmp_path / "AppSupport" / "tabIt")
    monkeypatch.setattr(paths, "ENV_DIR", tmp_path / "AppSupport" / "tabIt" / "env")
    monkeypatch.setattr(paths, "BIN_DIR", tmp_path / "AppSupport" / "tabIt" / "bin")
    monkeypatch.setattr(paths, "CHARTS_DIR", tmp_path / "AppSupport" / "tabIt" / "charts")
    monkeypatch.setattr(paths, "LOG_DIR", tmp_path / "Logs" / "tabIt")
    monkeypatch.setattr(paths, "TABIT_SYMLINK", tmp_path / "local-bin" / "tabit")
    paths.APP_SUPPORT.mkdir(parents=True)
    paths.CHARTS_DIR.mkdir(parents=True)
    monkeypatch.setattr(launchd, "uninstall_agent", lambda: None)

    def no_stdin(prompt=""):
        raise EOFError
    monkeypatch.setattr("builtins.input", no_stdin)

    assert cli_main(["uninstall"]) == 0
    assert paths.CHARTS_DIR.exists()
    assert "kept" in capsys.readouterr().out


def test_uninstall_purge_removes_symlink_logs_and_app_support(tmp_path, monkeypatch, capsys):
    from helper import paths

    app_support = tmp_path / "AppSupport" / "tabIt"
    env_dir = app_support / "env"
    bin_dir = app_support / "bin"
    charts_dir = app_support / "charts"
    log_dir = tmp_path / "Logs" / "tabIt"
    symlink = tmp_path / "local-bin" / "tabit"

    monkeypatch.setattr(paths, "APP_SUPPORT", app_support)
    monkeypatch.setattr(paths, "ENV_DIR", env_dir)
    monkeypatch.setattr(paths, "BIN_DIR", bin_dir)
    monkeypatch.setattr(paths, "CHARTS_DIR", charts_dir)
    monkeypatch.setattr(paths, "LOG_DIR", log_dir)
    monkeypatch.setattr(paths, "TABIT_SYMLINK", symlink)
    monkeypatch.setattr(launchd, "uninstall_agent", lambda: None)

    env_dir.mkdir(parents=True)
    (env_dir / "bin").mkdir()
    (env_dir / "bin" / "tabit").write_text("#!/bin/sh\n")
    charts_dir.mkdir(parents=True)
    log_dir.mkdir(parents=True)
    (log_dir / "helper.log").write_text("log\n")
    symlink.parent.mkdir(parents=True)
    symlink.symlink_to(env_dir / "bin" / "tabit")

    assert cli_main(["uninstall", "--purge"]) == 0

    assert not symlink.exists() and not symlink.is_symlink()
    assert not log_dir.exists()
    assert not app_support.exists()


def test_uninstall_leaves_foreign_symlink_alone(tmp_path, monkeypatch, capsys):
    from helper import paths

    app_support = tmp_path / "AppSupport" / "tabIt"
    env_dir = app_support / "env"
    bin_dir = app_support / "bin"
    charts_dir = app_support / "charts"
    log_dir = tmp_path / "Logs" / "tabIt"
    symlink = tmp_path / "local-bin" / "tabit"

    monkeypatch.setattr(paths, "APP_SUPPORT", app_support)
    monkeypatch.setattr(paths, "ENV_DIR", env_dir)
    monkeypatch.setattr(paths, "BIN_DIR", bin_dir)
    monkeypatch.setattr(paths, "CHARTS_DIR", charts_dir)
    monkeypatch.setattr(paths, "LOG_DIR", log_dir)
    monkeypatch.setattr(paths, "TABIT_SYMLINK", symlink)
    monkeypatch.setattr(launchd, "uninstall_agent", lambda: None)

    app_support.mkdir(parents=True)
    charts_dir.mkdir(parents=True)
    foreign_target = tmp_path / "some-other-tool"
    foreign_target.write_text("not tabit\n")
    symlink.parent.mkdir(parents=True)
    symlink.symlink_to(foreign_target)

    assert cli_main(["uninstall", "--purge"]) == 0

    assert symlink.is_symlink()
    assert symlink.resolve() == foreign_target.resolve()
