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
