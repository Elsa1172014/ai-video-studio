#!/bin/sh
# TEST STUB ONLY - stands in for a real TTS engine in scripts/e2e.mjs.
# Writes a tone whose length follows the text length and whose pitch differs per voice id.
set -e
WORDS=$(printf '%s' "$TTS_TEXT" | wc -w)
DUR=$(awk "BEGIN{d=$WORDS/2.2; if(d<1)d=1; print d}")
FREQ=$(printf '%s' "$TTS_VOICE" | cksum | awk '{print 200 + $1 % 400}')
ffmpeg -loglevel error -f lavfi -i "sine=frequency=$FREQ:duration=$DUR" -y "$TTS_OUTPUT"
