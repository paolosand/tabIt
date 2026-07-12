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
TABIT_SYMLINK = Path.home() / ".local" / "bin" / "tabit"
# Dedicated port, deliberately outside the dev-default neighborhood (8000,
# 3000, 5173…) so the login agent never collides with development servers.
# 28224 ≈ "TABIT" on a phone keypad (8-2-2-4-8, truncated to fit <65536).
PORT = 28224
HEALTH_URL = f"http://127.0.0.1:{PORT}/health"
