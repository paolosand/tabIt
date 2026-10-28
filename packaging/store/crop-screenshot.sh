#!/bin/sh
# Usage: crop-screenshot.sh <in.png> <out.png>
# Crops the top 110 px (the YouTube header) and resizes to 1280x800 using sips.
set -eu
if [ "$#" -ne 2 ]; then
  echo "usage: $0 <in.png> <out.png>" >&2
  exit 2
fi
in=$1
out=$2
[ -f "$in" ] || { echo "no such file: $in" >&2; exit 1; }
h=$(sips -g pixelHeight "$in" | awk '/pixelHeight/ {print $2}')
w=$(sips -g pixelWidth "$in" | awk '/pixelWidth/ {print $2}')
new_h=$((h - 110))
[ "$new_h" -gt 0 ] || { echo "image is too short to crop 110 px" >&2; exit 1; }
tmp=$(mktemp -t tabit-shot).png
trap 'rm -f "$tmp"' EXIT
sips --cropToHeightWidth "$new_h" "$w" --cropOffset 110 0 "$in" --out "$tmp" >/dev/null
sips --resampleHeightWidth 800 1280 "$tmp" --out "$out" >/dev/null
echo "wrote $out"
