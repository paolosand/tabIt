#!/usr/bin/env bash
# Renders the placeholder Web Store icons (16/32/48/128 px PNG) into extension/icons/
# from docs/assets/logo-light.svg.
#
# Requires macOS: it uses the built-in `sips`, which can rasterize SVG.
# The wordmark is wide, so it is rasterized at 1024 px wide, padded onto a white
# square, then downscaled to each size.
#
# These are PLACEHOLDERS. Replacing the four PNGs by hand with the final art is
# fine: nothing else (manifest, build) needs to change. The PNGs are committed
# because they are build inputs; this script only needs re-running to regenerate.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
svg="$here/../../docs/assets/logo-light.svg"
out="$here/../icons"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$out"
sips -s format png -Z 1024 "$svg" --out "$tmp/wide.png" >/dev/null
sips --padToHeightWidth 1024 1024 --padColor FFFFFF "$tmp/wide.png" --out "$tmp/square.png" >/dev/null

for size in 16 32 48 128; do
  sips -z "$size" "$size" "$tmp/square.png" --out "$out/icon$size.png" >/dev/null
  echo "wrote icons/icon$size.png"
done
