#!/usr/bin/env bash
# Run only on an approved GPU instance. This script does not rent machines.
set -euo pipefail
WAN_DIR=${WAN_DIR:-/opt/Wan2.2}
WAN_CKPT_DIR=${WAN_CKPT_DIR:-/models/Wan2.2-TI2V-5B}
WAN_REVISION=1ea34ff48f87168174e12956e200b1d908b1c5ff
command -v nvidia-smi >/dev/null
command -v ffmpeg >/dev/null
if [ ! -d "$WAN_DIR/.git" ]; then git clone https://github.com/Wan-Video/Wan2.2.git "$WAN_DIR"; fi
git -C "$WAN_DIR" checkout "$WAN_REVISION"
python -m pip install -r "$WAN_DIR/requirements.txt" -r worker/requirements.txt 'huggingface_hub[cli]'
python - "$WAN_CKPT_DIR" <<'PY'
import sys
from huggingface_hub import snapshot_download
snapshot_download('Wan-AI/Wan2.2-TI2V-5B', local_dir=sys.argv[1])
PY
python -c 'import torch; assert torch.cuda.is_available(), "CUDA unavailable"'
printf '%s\n' 'Wan runtime and weights installed. Start worker with WAN_DIR and WAN_CKPT_DIR, GPU_API_KEY, and durable OUTPUT_DIR/JOB_DIR.'
