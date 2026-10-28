#!/bin/sh
# Usage: crop-screenshot.sh <in.png> <out.png>
# Drops the top 110 px (the YouTube header), crops the rest to 16:10 without
# stretching, then resizes to exactly 1280x800 using sips.
set -eu
if [ "$#" -ne 2 ]; then
  echo "usage: $0 <in.png> <out.png>" >&2
  exit 2
fi
in=$1
out=$2
[ -f "$in" ] || { echo "no such file: $in" >&2; exit 1; }
[ "$in" -ef "$out" ] && { echo "refusing to overwrite the input" >&2; exit 1; }
h=$(sips -g pixelHeight "$in" | awk '/pixelHeight/ {print $2}')
w=$(sips -g pixelWidth "$in" | awk '/pixelWidth/ {print $2}')
# One pixel is left uncropped at the bottom: sips ignores --cropOffset when the
# crop would end exactly at the bottom edge.
avail=$((h - 111))
[ "$avail" -gt 0 ] || { echo "image is too short to crop 110 px" >&2; exit 1; }
base=$(mktemp -t tabit-shot)
tmp=$base.png
trap 'rm -f "$base" "$tmp"' EXIT
want=$((w * 10 / 16))
if [ "$want" -le "$avail" ]; then
  # Full width, 16:10 height, starting just below the header.
  sips --cropToHeightWidth "$want" "$w" --cropOffset 110 0 "$in" --out "$tmp" >/dev/null
else
  # Too short for the full width: centre-crop the width so nothing is stretched.
  cw=$((avail * 16 / 10))
  sips --cropToHeightWidth "$avail" "$cw" --cropOffset 110 $(((w - cw) / 2)) "$in" --out "$tmp" >/dev/null
fi
sips --resampleHeightWidth 800 1280 "$tmp" --out "$out" >/dev/null
echo "wrote $out"
