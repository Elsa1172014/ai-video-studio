#!/usr/bin/env bash
# Start on an already rented host. No rentals, payments or firewall changes.
set -euo pipefail
STUDIO_REPO=$(cd "$(dirname "$0")/.." && pwd)
: "${GPU_API_KEY:?Set the same GPU_API_KEY as the Vercel Preview}"
export WAN_DIR=${WAN_DIR:-/opt/Wan2.2}
export WAN_CKPT_DIR=${WAN_CKPT_DIR:-/models/Wan2.2-TI2V-5B}
export OUTPUT_DIR=${OUTPUT_DIR:-/workspace/ai-video-output}
export JOB_DIR=${JOB_DIR:-$OUTPUT_DIR/jobs}
export TTS_ENGINE=${TTS_ENGINE:-edge}
export TTS_TIMEOUT_SECONDS=${TTS_TIMEOUT_SECONDS:-120}
export WAN_TIMEOUT_SECONDS=${WAN_TIMEOUT_SECONDS:-1800}
command -v ffmpeg >/dev/null
command -v nvidia-smi >/dev/null
test -f "$WAN_DIR/generate.py"
test -f "$WAN_CKPT_DIR/config.json"
mkdir -p "$OUTPUT_DIR" "$JOB_DIR"
cd "$STUDIO_REPO"
python -c 'import torch; assert torch.cuda.is_available(), "CUDA unavailable"; import edge_tts'
# Reverse proxy/tunnel must expose HTTPS with a valid certificate.
# Keep this listener local; do not expose an unencrypted GPU API publicly.
exec python -m uvicorn main:app --app-dir worker --host 127.0.0.1 --port "${WORKER_PORT:-8000}"
