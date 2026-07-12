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
