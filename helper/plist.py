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
