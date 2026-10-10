"""Bridge to the official Wan 2.2 TI2V-5B CLI; no user text enters a shell."""
import asyncio, math, os, sys, tempfile
from pathlib import Path
from fetch import fetch_media

FPS = 24

def command(prompt, seconds, output, width=None, height=None, image=None):
    root = Path(os.getenv('WAN_DIR', '/opt/Wan2.2')).resolve()
    weights = Path(os.getenv('WAN_CKPT_DIR', '/models/Wan2.2-TI2V-5B')).resolve()
    if not (root / 'generate.py').is_file() or not (weights / 'config.json').is_file():
        raise RuntimeError('Wan 2.2 runtime/weights missing; run scripts/setup-wan-vast.sh on the GPU host')
    if not 1 <= seconds <= 10:
        raise RuntimeError('Wan single shots must be 1–10 seconds; split longer videos into shots')
    size = '704*1280' if width and height and height > width else '1280*704'
    frames = 4 * math.ceil((seconds * FPS - 1) / 4) + 1
    args = [os.getenv('WAN_PYTHON', sys.executable), str(root / 'generate.py'),
            '--task', 'ti2v-5B', '--size', size, '--ckpt_dir', str(weights),
            '--offload_model', 'True', '--convert_model_dtype', '--t5_cpu',
            '--frame_num', str(frames), '--prompt', prompt, '--save_file', str(output)]
    if image: args += ['--image', str(image)]
    return root, args

async def generate(prompt, seconds, output, image_url=None, width=None, height=None):
    with tempfile.TemporaryDirectory(prefix='wan-ref-') as work:
        image = await asyncio.to_thread(fetch_media, image_url, Path(work), '.png') if image_url else None
        root, args = command(prompt, seconds, output, width, height, image)
        # Log to disk to avoid buffering gigabytes of model progress in memory.
        with tempfile.TemporaryFile() as log:
            proc = await asyncio.create_subprocess_exec(*args, cwd=root, stdout=log, stderr=log)
            try:
                await asyncio.wait_for(proc.wait(), timeout=int(os.getenv('WAN_TIMEOUT_SECONDS', '1800')))
            except (asyncio.CancelledError, TimeoutError):
                proc.kill(); await proc.wait(); raise
            if proc.returncode:
                log.seek(0, 2); log.seek(max(0, log.tell() - 3000))
                raise RuntimeError(log.read().decode(errors='replace') or 'Wan inference failed')
        if not output.is_file() or output.stat().st_size == 0:
            raise RuntimeError('Wan finished without an MP4 file')
