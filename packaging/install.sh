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
case "$avail_gb" in
  ''|*[!0-9]*) fail "could not determine free disk space for $HOME (df output changed?)" ;;
esac
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
