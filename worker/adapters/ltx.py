import os
import sys
import shutil
import asyncio
import tempfile
import signal
from pathlib import Path

from .base import VideoAdapter
from storage import OUTPUT_DIR, output_path, public_url


class LTXAdapter(VideoAdapter):
    async def generate(self, prompt: str, duration: int, image_url: str | None = None) -> str:
        ltx_dir = Path(os.getenv("LTX_DIR", str(Path.home() / "LTX-Video"))).expanduser()
        inference = ltx_dir / "inference.py"
        pipeline_config = os.getenv(
            "LTX_PIPELINE_CONFIG",
            "configs/ltxv-2b-0.9.6-distilled.yaml",
        )

        if not inference.exists():
            raise RuntimeError(
                f"LTX-Video was not found at {ltx_dir}. Set LTX_DIR to the official LTX-Video checkout."
            )

        if image_url:
            raise RuntimeError(
                "Image-conditioned LTX generation is not enabled yet; use text-to-video for this worker."
            )

        # LTX expects frame counts of N*8+1. At 30 fps this gives approximately
        # the requested duration while keeping the model's required shape.
        requested_frames = max(9, int(duration * 30) + 1)
        num_frames = ((requested_frames - 2) // 8 + 1) * 8 + 1

        target = output_path()
        job_dir = Path(tempfile.mkdtemp(prefix="ltx-", dir=str(OUTPUT_DIR)))

        args = [
            sys.executable,
            str(inference),
            "--prompt",
            prompt,
            "--height",
            os.getenv("LTX_HEIGHT", "512"),
            "--width",
            os.getenv("LTX_WIDTH", "768"),
            "--num_frames",
            str(num_frames),
            "--frame_rate",
            os.getenv("LTX_FRAME_RATE", "30"),
            "--seed",
            os.getenv("LTX_SEED", "42"),
            "--pipeline_config",
            pipeline_config,
            "--output_path",
            str(job_dir),
        ]

        # A failed/aborted LTX subprocess can leave CUDA memory occupied. Before
        # starting a new scene, remove only stale LTX inference processes from
        # previous jobs; never kill the worker itself.
        try:
            cleanup = await asyncio.create_subprocess_exec(
                "pkill", "-f", str(inference),
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await cleanup.communicate()
        except Exception:
            pass

        env = os.environ.copy()
        env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

        try:
            process = await asyncio.create_subprocess_exec(
                *args,
                cwd=str(ltx_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
                start_new_session=True,
            )
            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                detail = (stderr or stdout).decode(errors="replace")[-4000:]
                raise RuntimeError(detail or "LTX generation failed")

            generated = sorted(job_dir.glob("*.mp4"), key=lambda p: p.stat().st_mtime)
            if not generated:
                detail = (stderr or stdout).decode(errors="replace")[-2000:]
                raise RuntimeError(
                    "LTX completed without an MP4 output. " + detail
                )

            shutil.move(str(generated[-1]), str(target))
            return public_url(target)
        finally:
            shutil.rmtree(job_dir, ignore_errors=True)
