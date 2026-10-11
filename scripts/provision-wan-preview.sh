#!/usr/bin/env bash
# Install only on the already approved instance; never rent or change drivers.
set -euo pipefail
test "${CONTAINER_ID:-}" = 55356791
STUDIO_REPO=$(cd "$(dirname "$0")/.." && pwd)
STUDIO_VENV=/venv/studio
export WAN_DIR=/opt/Wan2.2 WAN_CKPT_DIR=/models/Wan2.2-TI2V-5B
command -v uv >/dev/null
command -v ffmpeg >/dev/null
test "$(df --output=avail -BG /workspace | tail -1 | tr -dc '0-9')" -ge 55
# Keep Vast's management environment intact. Use a known Wan/FlashAttention ABI.
if [ ! -x "$STUDIO_VENV/bin/python" ]; then uv venv --python 3.11 "$STUDIO_VENV"; fi
source "$STUDIO_VENV/bin/activate"
uv pip install torch==2.6.0 torchvision==0.21.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124
if [ ! -d "$WAN_DIR/.git" ]; then git clone https://github.com/Wan-Video/Wan2.2.git "$WAN_DIR"; fi
git -C "$WAN_DIR" checkout 1ea34ff48f87168174e12956e200b1d908b1c5ff
# Retrieve the vendor's prebuilt wheel instead of compiling against host CUDA 13.
python - <<'PY'
import json, pathlib, urllib.request
req = urllib.request.Request('https://api.github.com/repos/Dao-AILab/flash-attention/releases/tags/v2.7.4.post1', headers={'User-Agent':'AI-Video-Studio-Preview'})
with urllib.request.urlopen(req, timeout=30) as response:
    release = json.load(response)
assets = [a for a in release['assets'] if 'cu12torch2.6cxx11abiFALSE-cp311-cp311-linux_x86_64.whl' in a['name']]
assert len(assets) == 1, 'Expected official matching FlashAttention wheel missing'
asset = assets[0]
target = pathlib.Path('/workspace') / asset['name']
if not target.exists() or target.stat().st_size != asset['size']:
    urllib.request.urlretrieve(asset['browser_download_url'], target)
assert target.stat().st_size == asset['size']
pathlib.Path('/workspace/studio-flash-wheel-path').write_text(str(target))
PY
uv pip install "$(cat /workspace/studio-flash-wheel-path)" 'numpy<2' 'opencv-python==4.11.0.86' 'diffusers==0.33.1' 'transformers==4.51.3' 'accelerate==1.6.0' 'huggingface_hub==0.32.4' 'imageio[ffmpeg]' easydict ftfy dashscope imageio-ffmpeg decord==0.6.0 peft==0.15.2 librosa==0.11.0 omegaconf==2.3.0 loguru sentencepiece -r "$STUDIO_REPO/worker/requirements.txt"
python - <<'PY'
import torch, flash_attn
assert torch.cuda.is_available()
q=torch.randn(1,16,2,64,device='cuda',dtype=torch.bfloat16)
out=flash_attn.flash_attn_func(q,q,q)
assert out.shape == q.shape and torch.isfinite(out).all()
print('Dedicated Wan environment: CUDA and FlashAttention kernels passed')
PY
export HF_HUB_DISABLE_PROGRESS_BARS=1
python - <<'PY'
import json, os, pathlib
from huggingface_hub import model_info, snapshot_download
repo='Wan-AI/Wan2.2-TI2V-5B'
revision=model_info(repo).sha
snapshot_download(repo, revision=revision, local_dir=os.environ['WAN_CKPT_DIR'], max_workers=4)
pathlib.Path('/workspace/wan-preview-weights.json').write_text(json.dumps({'repository':repo,'revision':revision}))
print('Official Wan weights downloaded at revision:', revision)
PY
cd "$WAN_DIR"
python generate.py --help >/dev/null
cd "$STUDIO_REPO/worker"
python -m unittest discover -p 'test_*.py'
touch /workspace/wan-preview-provisioned
printf '%s\n' 'Wan source, weights, CLI imports and worker unit tests passed. No inference or public API was started.'
