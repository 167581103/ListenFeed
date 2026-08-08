#!/usr/bin/env bash
# Turn a master recording into the two web encodings the feed serves.
#
#   ./scripts/encode-audio.sh <master-audio> <slug>
#
# Speech at 160 kbps stereo wastes bandwidth, and bandwidth is the dominant cost
# of an audio feed. Mono at 24 kHz keeps voices intact while cutting the payload
# by roughly 5x. Output names carry a content hash so the CDN can treat them as
# immutable and a changed recording never collides with a cached one.
set -euo pipefail

master=${1:?usage: encode-audio.sh <master-audio> <slug>}
slug=${2:?usage: encode-audio.sh <master-audio> <slug>}
out_dir="public/audio"
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

mkdir -p "$out_dir"

ffmpeg -v error -y -i "$master" -ac 1 -ar 24000 -b:a 64k -map_metadata -1 "$tmp_dir/out.mp3"
ffmpeg -v error -y -i "$master" -ac 1 -ar 24000 -c:a libopus -b:a 32k -vbr on \
  -application audio -map_metadata -1 "$tmp_dir/out.webm"

for ext in mp3 webm; do
  hash=$(sha256sum "$tmp_dir/out.$ext" | cut -c1-8)
  cp "$tmp_dir/out.$ext" "$out_dir/$slug.$hash.$ext"
  printf '%s: %s.%s.%s (%s bytes)\n' "$ext" "$slug" "$hash" "$ext" \
    "$(stat -c%s "$out_dir/$slug.$hash.$ext")"
done

printf 'duration_ms: %.0f\n' \
  "$(echo "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$master") * 1000" | bc)"
