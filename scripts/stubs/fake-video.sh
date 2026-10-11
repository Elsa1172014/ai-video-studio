#!/bin/sh
# TEST STUB ONLY - stands in for a real video model in scripts/e2e.mjs.
# Renders an ffmpeg test pattern of the requested size/length. Not a generation provider.
# Fails once when the prompt contains FAILONCE, to exercise retry.
set -e
if echo "$VIDEO_PROMPT" | grep -q FAILONCE && [ ! -f "$OUTPUT_DIR/.failed-once" ]; then
  touch "$OUTPUT_DIR/.failed-once"; echo "stub: simulated GPU failure" >&2; exit 1
fi
W=${VIDEO_WIDTH:-768}; H=${VIDEO_HEIGHT:-448}
ffmpeg -loglevel error -f lavfi -i "testsrc=size=${W}x${H}:rate=24" -t "${VIDEO_DURATION:-3}" -pix_fmt yuv420p -y "$VIDEO_OUTPUT"
