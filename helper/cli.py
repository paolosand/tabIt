"""`tabit` — manage the tabIt helper (the local analysis service).

Stdlib only: the CLI must work without pulling FastAPI into the import path.
Heavy imports (warmup) stay inside their subcommand functions.
"""
import argparse
import os
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
        try:
            subprocess.run(["tail", "-f", str(paths.LOG_FILE)])
        except KeyboardInterrupt:
            pass
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

    if paths.TABIT_SYMLINK.is_symlink():
        try:
            target = os.path.realpath(paths.TABIT_SYMLINK)
            env_dir = os.path.realpath(paths.ENV_DIR)
        except OSError:
            target = env_dir = None
        if target is not None and (target == env_dir or target.startswith(env_dir + os.sep)):
            paths.TABIT_SYMLINK.unlink()
            print(f"removed {paths.TABIT_SYMLINK}")

    for d in (paths.ENV_DIR, paths.BIN_DIR):
        if d.exists():
            shutil.rmtree(d)
            print(f"removed {d}")

    if paths.LOG_DIR.exists():
        shutil.rmtree(paths.LOG_DIR)
        print(f"removed {paths.LOG_DIR}")

    if paths.CHARTS_DIR.exists():
        if args.purge:
            answer = "y"
        else:
            try:
                answer = input(
                    f"delete the analyzed-chart cache at {paths.CHARTS_DIR}? [y/N] "
                ).strip().lower()
            except EOFError:  # non-interactive stdin — keep the cache
                answer = "n"
        if answer == "y":
            shutil.rmtree(paths.CHARTS_DIR)
            print(f"removed {paths.CHARTS_DIR}")
        else:
            print(f"kept {paths.CHARTS_DIR}")

    if paths.APP_SUPPORT.exists():
        try:
            paths.APP_SUPPORT.rmdir()
            print(f"removed {paths.APP_SUPPORT}")
        except OSError:
            pass  # not empty (e.g. charts kept) — leave it in place

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
    except (RuntimeError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
