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
# Pinned release: bump per release so `curl | sh` always installs a
# known-good version (override with TABIT_REF=main for bleeding edge, or pin
# TABIT_REF=v0.3.1 for the previous Demucs + crema pipeline with slash chords).
TABIT_REF="${TABIT_REF:-v0.4.0}"
FFMPEG_RELEASE="b6.1.1"
# Pinned checksums for the static ffmpeg binaries fetched below — computed
# once from the b6.1.1 release assets. Bump these together with FFMPEG_RELEASE.
FFMPEG_SHA256_ARM64="a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584"
FFMPEG_SHA256_X64="ebdddc936f61e14049a2d4b549a412b8a40deeff6540e58a9f2a2da9e6b18894"

APP_SUPPORT="$HOME/Library/Application Support/tabIt"
ENV_DIR="$APP_SUPPORT/env"
BIN_DIR="$APP_SUPPORT/bin"
# Must match helper/paths.py PORT (dedicated port, off the dev-default 8000).
TABIT_PORT=28224
HEALTH_URL="http://127.0.0.1:$TABIT_PORT/health"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

# 0.3.x environments carry ~2 GB of TensorFlow / Demucs / crema / CREPE packages
# that 0.4 no longer uses. `uv pip install` never uninstalls what a new version
# stopped requiring, so such an environment is rebuilt instead of reused.
legacy_env() {
  [ -x "$ENV_DIR/bin/python" ] || return 1
  "$ENV_DIR/bin/python" -c '
import importlib.util, sys
mods = ("tensorflow", "demucs", "crema", "crepe")
sys.exit(0 if any(importlib.util.find_spec(m) for m in mods) else 1)' 2>/dev/null
}

# $1 = true to create the venv first. Kept as a function so the caller can roll
# back when the legacy-environment swap fails halfway.
install_engine() {
  if [ "$1" = true ]; then
    "$UV" venv --python 3.11 "$ENV_DIR" || return 1
  fi
  "$UV" pip install --python "$ENV_DIR/bin/python" \
    "tabit-engine[api] @ git+$TABIT_REPO@$TABIT_REF"
}

# Wrapping the whole install in main(), called only as the literal last line,
# means a truncated `curl | sh` (network cut off mid-stream) hits a shell
# syntax error while parsing the function body instead of executing whatever
# prefix of commands happened to arrive.
main() {
  # --- preflight ---------------------------------------------------------------
  [ "$(uname -s)" = Darwin ] || fail "the tabIt helper currently supports macOS only"
  case "$(uname -m)" in
    arm64)
      FFMPEG_ARCH=arm64
      FFMPEG_SHA256="$FFMPEG_SHA256_ARM64" ;;
    x86_64)
      FFMPEG_ARCH=x64
      FFMPEG_SHA256="$FFMPEG_SHA256_X64"
      printf 'note: Intel Mac detected — analysis runs on CPU (several minutes per song).\n' ;;
    *) fail "unsupported architecture: $(uname -m)" ;;
  esac

  # Measured for 0.4.0: the environment is ~1 GB and uv's wheel cache another
  # ~1 GB, plus ffmpeg and the 12 MB model: a fresh install needs ~2 GB, so
  # require 3. Replacing a 0.3.x environment keeps the old ~2.2 GB one until
  # the new one is built, so that case needs ~4.2 GB: require 5.
  need_gb=3
  if legacy_env; then need_gb=5; fi
  avail_gb="$(df -g "$HOME" | awk 'NR==2 {print $4}')"
  case "$avail_gb" in
    ''|*[!0-9]*) fail "could not determine free disk space for $HOME (df output changed?)" ;;
  esac
  [ "$avail_gb" -ge "$need_gb" ] || fail "about $need_gb GB of free disk is needed (found ${avail_gb} GB free)"

  upgrading=false
  if health="$(curl -sf --max-time 2 "$HEALTH_URL" 2>/dev/null)"; then
    case "$health" in
      *engineVersion*)
        printf 'existing tabIt helper found on port %s — upgrading in place.\n' "$TABIT_PORT"
        upgrading=true ;;
      *) fail "port $TABIT_PORT is in use by something that isn't the tabIt helper; stop it and rerun" ;;
    esac
  elif curl -s --max-time 2 -o /dev/null "http://127.0.0.1:$TABIT_PORT/"; then
    fail "port $TABIT_PORT is in use by something that isn't the tabIt helper; stop it and rerun"
  elif curl -sf --max-time 2 "http://127.0.0.1:8000/health" 2>/dev/null | grep -q engineVersion; then
    # A helper from before the dedicated-port move (or a dev API) answers on
    # the legacy port. Treat it as an upgrade so the old agent gets booted out
    # below rather than lingering on 8000 alongside the new one.
    printf 'tabIt helper found on legacy port 8000 — migrating it to %s.\n' "$TABIT_PORT"
    upgrading=true
  fi

  if [ "$upgrading" = true ]; then
    # Bootout the running agent so launchd can't respawn it from underneath
    # the venv rebuild below; `tabit install-agent` re-bootstraps it later.
    launchctl bootout "gui/$(id -u)/com.tabit.helper" 2>/dev/null || true
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
  mkdir -p "$APP_SUPPORT" "$BIN_DIR"
  # A run interrupted mid-swap leaves the old environment behind: put it back if
  # the new one never got created, otherwise drop it.
  if [ -d "$ENV_DIR.old" ]; then
    if [ -e "$ENV_DIR" ]; then rm -rf "$ENV_DIR.old"; else mv "$ENV_DIR.old" "$ENV_DIR"; fi
  fi

  env_backup=""
  if legacy_env; then
    step "Replacing the 0.3.x Python environment (TensorFlow, Demucs and crema are no longer used)"
    # Charts and downloaded models live beside the environment, not in it, and
    # are kept. The old environment is only deleted once the new one works.
    launchctl bootout "gui/$(id -u)/com.tabit.helper" 2>/dev/null || true
    mv "$ENV_DIR" "$ENV_DIR.old"
    env_backup="$ENV_DIR.old"
  fi

  create_env=true
  if [ -x "$ENV_DIR/bin/python" ] && "$ENV_DIR/bin/python" --version >/dev/null 2>&1; then
    step "Reusing the existing Python environment"
    create_env=false
  else
    step "Creating the Python 3.11 environment (first run downloads ~1 GB of wheels)"
  fi

  if ! install_engine "$create_env"; then
    if [ -n "$env_backup" ]; then
      rm -rf "$ENV_DIR"
      mv "$env_backup" "$ENV_DIR"
      fail "installing tabIt failed; your previous environment was restored (start it with: tabit start)"
    fi
    fail "installing tabIt failed"
  fi
  [ -z "$env_backup" ] || rm -rf "$env_backup"

  # --- ffmpeg --------------------------------------------------------------------
  step "Installing ffmpeg (static build $FFMPEG_RELEASE)"
  ffmpeg_ok=false
  if [ -x "$BIN_DIR/ffmpeg" ]; then
    if echo "$FFMPEG_SHA256  $BIN_DIR/ffmpeg" | shasum -a 256 -c - >/dev/null 2>&1; then
      ffmpeg_ok=true
    else
      rm -f "$BIN_DIR/ffmpeg"
    fi
  fi
  if [ "$ffmpeg_ok" = false ]; then
    curl -fsSL -o "$BIN_DIR/ffmpeg" \
      "https://github.com/eugeneware/ffmpeg-static/releases/download/$FFMPEG_RELEASE/ffmpeg-darwin-$FFMPEG_ARCH"
    if ! echo "$FFMPEG_SHA256  $BIN_DIR/ffmpeg" | shasum -a 256 -c - >/dev/null 2>&1; then
      rm -f "$BIN_DIR/ffmpeg"
      fail "downloaded ffmpeg failed checksum verification"
    fi
    chmod +x "$BIN_DIR/ffmpeg"
  fi
  "$BIN_DIR/ffmpeg" -version >/dev/null 2>&1 || fail "downloaded ffmpeg does not run"

  # --- models ---------------------------------------------------------------------
  step "Downloading the chord model and running a test inference (one-time; ~12 MB)"
  "$ENV_DIR/bin/tabit" warmup

  # --- service --------------------------------------------------------------------
  step "Installing the background service (starts at login, restarts on crash)"
  "$ENV_DIR/bin/tabit" install-agent

  # --- tabit on PATH ----------------------------------------------------------------
  mkdir -p "$HOME/.local/bin"
  ln -sf "$ENV_DIR/bin/tabit" "$HOME/.local/bin/tabit"
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) printf 'note: add ~/.local/bin to your PATH to use the tabit command directly.\n' ;;
  esac

  printf '\n\033[1m✓ tabIt helper installed and running.\033[0m\n'
  printf 'Next: load the Chrome extension — see %s#readme\n' "$TABIT_REPO"
  printf 'Manage it with: tabit status · tabit logs · tabit restart · tabit uninstall\n'
}

main "$@"
