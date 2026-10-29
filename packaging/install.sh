#!/bin/sh
# tabIt helper installer — macOS only.
#
#   curl -fsSL https://raw.githubusercontent.com/paolosand/tabIt/main/packaging/install.sh | sh
#
# Idempotent: rerunning upgrades in place. Development overrides:
#   TABIT_REPO  git URL (or file:///abs/path) to install from
#   TABIT_REF   git ref to install (pin this to a release tag when publishing)
#   TABIT_WHEEL path or https URL of a tabit_engine-*.whl; overrides everything
#               (otherwise the release wheel for TABIT_REF is used, and git only
#               as a last resort)
set -eu

TABIT_REPO="${TABIT_REPO:-https://github.com/paolosand/tabIt}"
# Pinned release: bump per release so `curl | sh` always installs a
# known-good version (override with TABIT_REF=main for bleeding edge, or pin
# TABIT_REF=v0.3.1 for the previous Demucs + crema pipeline with slash chords).
TABIT_REF="${TABIT_REF:-v0.4.1}"
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
fail() {
  [ -z "${WHEEL_DIR:-}" ] || rm -rf "$WHEEL_DIR"
  printf 'error: %s\n' "$*" >&2
  exit 1
}

# Backstop for aborts that bypass fail() (a `set -e` exit, e.g. the uv installer
# pipe failing): the temp wheel dir never outlives the script. Independent of the
# INT/TERM/HUP restore traps, and it touches nothing but WHEEL_DIR.
cleanup_wheel_dir() { [ -z "${WHEEL_DIR:-}" ] || rm -rf "$WHEEL_DIR"; }
trap cleanup_wheel_dir EXIT

# Is git safe to run? Decided WITHOUT running it: on a Mac that never had
# developer tools /usr/bin/git is a shim whose mere execution pops Apple's
# "install the command line tools" dialog. `-ef` compares the files themselves,
# so every spelling of the shim (/usr/bin//git, /bin/../usr/bin/git, a symlink
# to it) is recognised. TABIT_ASSUME_NO_GIT=1 forces "no" (CI negative test).
git_usable() {
  if [ "${TABIT_ASSUME_NO_GIT:-}" = 1 ]; then return 1; fi
  git_path="$(command -v git 2>/dev/null || true)"
  [ -n "$git_path" ] || return 1  # no git on PATH at all: nothing to run
  if ! [ "$git_path" -ef /usr/bin/git ]; then return 0; fi
  xcode-select -p >/dev/null 2>&1
}

# True when $1 starts with the zip magic (PK\003\004): a captive-portal HTML
# page that curl -f accepted as 200 must not reach uv.
is_zip() {
  [ "$(head -c 4 "$1" 2>/dev/null | od -An -tx1 | tr -d ' \n')" = 504b0304 ]
}

# True only for a whole-string vX.Y.Z (a newline anywhere makes it fail).
is_release_tag() {
  expr "$1" : 'v[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*$' >/dev/null 2>&1
}

# Removes the temp wheel dir on INT/TERM/HUP. Replaced by restore_env if an
# upgrade swap starts later (restore_env removes the dir too).
wheel_signal() {
  trap - INT TERM HUP
  [ -z "${WHEEL_DIR:-}" ] || rm -rf "$WHEEL_DIR"
  exit 1
}

# $1 = URL, $2 = destination file. Fails like curl does when the body is not a zip.
download_wheel() {
  curl -fsSL -o "$2" "$1" && is_zip "$2"
}

# Sets INSTALL_SPEC (what `uv pip install` is given). Order: TABIT_WHEEL, then
# the GitHub release wheel for a default-repo vX.Y.Z tag, then git (only if it
# can run without a dialog). Runs before anything is created on disk.
select_install_source() {
  no_download="tabIt can't download its engine. Check your internet connection and run the command again."
  WHEEL_DIR=""
  if [ -n "${TABIT_WHEEL:-}" ]; then
    case "$TABIT_WHEEL" in
      https://*)
        wheel_name="${TABIT_WHEEL%%[?#]*}"
        wheel_name="${wheel_name##*/}"
        case "$wheel_name" in *.whl) ;; *) fail "$no_download" ;; esac
        WHEEL_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tabit-wheel.XXXXXX")" || fail "could not create a temporary directory"
        trap wheel_signal INT TERM HUP
        wheel="$WHEEL_DIR/$wheel_name"
        download_wheel "$TABIT_WHEEL" "$wheel" || fail "$no_download" ;;
      *)
        [ -f "$TABIT_WHEEL" ] || fail "TABIT_WHEEL=$TABIT_WHEEL is not a file"
        wheel="$TABIT_WHEEL" ;;
    esac
    INSTALL_SPEC="${wheel}[api]"
    return 0
  fi
  if [ "$TABIT_REPO" = "https://github.com/paolosand/tabIt" ] && is_release_tag "$TABIT_REF"; then
    WHEEL_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tabit-wheel.XXXXXX")" || fail "could not create a temporary directory"
    trap wheel_signal INT TERM HUP
    wheel="$WHEEL_DIR/tabit_engine-${TABIT_REF#v}-py3-none-any.whl"
    if download_wheel "$TABIT_REPO/releases/download/$TABIT_REF/tabit_engine-${TABIT_REF#v}-py3-none-any.whl" "$wheel"; then
      INSTALL_SPEC="${wheel}[api]"
      return 0
    fi
    rm -rf "$WHEEL_DIR"
    WHEEL_DIR=""
    trap - INT TERM HUP
  fi
  git_usable || fail "$no_download"
  INSTALL_SPEC="tabit-engine[api] @ git+$TABIT_REPO@$TABIT_REF"
}

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
    "$INSTALL_SPEC"
}

# After the old environment has been put back, bring its login agent back too
# (it was booted out so launchd couldn't respawn it mid-swap). `tabit start`
# is idempotent; only attempted when an agent plist exists.
resume_old_agent() {
  if [ -f "$HOME/Library/LaunchAgents/com.tabit.helper.plist" ] && [ -x "$ENV_DIR/bin/tabit" ]; then
    "$ENV_DIR/bin/tabit" start >/dev/null 2>&1 || true
  fi
}

# Puts the parked 0.3.x environment back. Used when an upgrade is interrupted
# (INT/TERM/HUP) while env.old exists; a hard kill is covered by the recovery at
# the start of the next run.
restore_env() {
  trap - INT TERM HUP
  [ -z "${WHEEL_DIR:-}" ] || rm -rf "$WHEEL_DIR"
  if [ -n "${env_backup:-}" ] && [ -d "$env_backup" ]; then
    rm -rf "$ENV_DIR"
    mv "$env_backup" "$ENV_DIR"
    resume_old_agent
    printf '\ninterrupted; your previous tabIt environment was restored (start it with: tabit start)\n' >&2
  fi
  exit 1
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
      printf 'note: Intel Mac detected — analysis runs on CPU, slower than on Apple Silicon.\n' ;;
    *) fail "unsupported architecture: $(uname -m)" ;;
  esac

  select_install_source

  # A previous upgrade that was killed mid-swap leaves env.old behind. env may then
  # be a half-built venv, so env.old is ALWAYS the one to trust: put it back
  # first, then let the normal detection below decide whether to rebuild (worst
  # case: one extra rebuild). Symlinks are refused rather than followed, since
  # rm -rf on a link would orphan its target.
  for d in "$ENV_DIR" "$ENV_DIR.old" "$ENV_DIR.trash"; do
    if [ -L "$d" ]; then fail "$d is a symlink; replace it with a real directory (or remove it) and rerun"; fi
  done
  # env.trash is an env.old whose deletion was interrupted: by construction
  # garbage (a half-deleted tree), never something to restore. Drop it BEFORE
  # looking at env.old.
  rm -rf "$ENV_DIR.trash"
  if [ -d "$ENV_DIR.old" ]; then
    printf 'restoring the environment left by an interrupted upgrade…\n'
    launchctl bootout "gui/$(id -u)/com.tabit.helper" 2>/dev/null || true
    rm -rf "$ENV_DIR"
    mv "$ENV_DIR.old" "$ENV_DIR"
  fi

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
  env_backup=""
  if legacy_env; then
    step "Replacing the 0.3.x Python environment (TensorFlow, Demucs and crema are no longer used)"
    # Charts and downloaded models live beside the environment, not in it, and
    # are kept. The old environment is only deleted once the new one is built,
    # ffmpeg is in place and the model warmup has passed; if ffmpeg or the warmup
    # fail it stays, and rerunning the installer restores it and tries again.
    launchctl bootout "gui/$(id -u)/com.tabit.helper" 2>/dev/null || true
    mv "$ENV_DIR" "$ENV_DIR.old"
    env_backup="$ENV_DIR.old"
    # Until the install fully succeeds, an interrupt puts the old env back.
    trap restore_env INT TERM HUP
  fi

  create_env=true
  if [ -x "$ENV_DIR/bin/python" ] && "$ENV_DIR/bin/python" --version >/dev/null 2>&1; then
    step "Reusing the existing Python environment"
    create_env=false
  else
    step "Creating the Python 3.11 environment (first run downloads ~1 GB of wheels; about 2 GB of disk with the cache)"
  fi

  # Rewritten after warmup succeeds; never left describing a replaced engine.
  rm -f "$APP_SUPPORT/VERSION"
  if install_engine "$create_env"; then
    install_ok=true
  else
    install_ok=false
  fi
  [ -z "$WHEEL_DIR" ] || rm -rf "$WHEEL_DIR"
  WHEEL_DIR=""
  [ -n "$env_backup" ] || trap - INT TERM HUP
  if [ "$install_ok" = false ]; then
    if [ -n "$env_backup" ]; then
      trap - INT TERM HUP
      rm -rf "$ENV_DIR"
      mv "$env_backup" "$ENV_DIR"
      resume_old_agent
      fail "installing tabIt failed; your previous environment was restored (and restarted if it was running; otherwise: tabit start)"
    fi
    fail "installing tabIt failed"
  fi

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
      fail "downloaded ffmpeg failed checksum verification; rerun the installer"
    fi
    chmod +x "$BIN_DIR/ffmpeg"
  fi
  "$BIN_DIR/ffmpeg" -version >/dev/null 2>&1 || fail "downloaded ffmpeg does not run; rerun the installer"

  # --- models ---------------------------------------------------------------------
  step "Downloading the chord model and running a test inference (one-time; ~12 MB)"
  "$ENV_DIR/bin/tabit" warmup ||
    fail "the model download / test inference failed; check your connection and rerun the installer"
  if [ -n "$env_backup" ]; then
    trap - INT TERM HUP
    # Rename first (atomic), then delete: an interrupted delete leaves env.trash,
    # which the next run discards, never a truncated env.old that it would restore.
    mv "$env_backup" "$ENV_DIR.trash" && rm -rf "$ENV_DIR.trash"
  fi

  # What is actually installed, whichever source it came from.
  engine_version="$("$ENV_DIR/bin/python" -I -c 'import importlib.metadata as m; print(m.version("tabit-engine"))')" ||
    fail "could not read the installed engine version"
  printf '%s\n' "$engine_version" > "$APP_SUPPORT/VERSION"

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
  printf 'Manage it with: ~/.local/bin/tabit status · logs · restart · uninstall\n'
}

main "$@"
