import asyncio
import uuid
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from finish import FinishOptions, ffmpeg, finish
from storage import OUTPUT_DIR, public_url


class RenderRequest(BaseModel):
    clips: list[str]
    finish: Optional[FinishOptions] = None
    durations: Optional[list[float]] = None


def local_clip(value: str) -> Path:
    name = value.rsplit('/', 1)[-1].split('?', 1)[0]
    path = (OUTPUT_DIR / name).resolve()
    if path.parent != OUTPUT_DIR.resolve() or not path.exists():
        raise RuntimeError(f'Clip not found: {name}')
    return path


async def _concat(paths: list[Path], out: Path) -> None:
    manifest = OUTPUT_DIR / f'{uuid.uuid4()}.txt'
    manifest.write_text(''.join(f"file '{p.as_posix()}'\n" for p in paths), encoding='utf-8')
    try:
        p = await asyncio.create_subprocess_exec(
            ffmpeg(), '-y', '-f', 'concat', '-safe', '0', '-i', str(manifest),
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', str(out),
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
        _, err = await p.communicate()
        if p.returncode or not out.exists():
            raise RuntimeError(err.decode(errors='ignore')[-3000:] or 'FFmpeg render failed')
    finally:
        manifest.unlink(missing_ok=True)


async def render(x: RenderRequest) -> dict:
    """Join scene clips. With `finish` options, run the cinematic finishing pipeline."""
    if not x.clips:
        raise RuntimeError('At least one clip is required')
    paths = [local_clip(c) for c in x.clips]
    out = OUTPUT_DIR / f'{uuid.uuid4()}.mp4'
    opts = x.finish
    if not opts and x.durations:
        opts = FinishOptions(transition="none", grade="none", vignette=0, grain=0, letterbox=False, fade=0)
    if opts and x.durations and not opts.durations:
        opts = opts.model_copy(update={"durations": x.durations})
    if opts:
        report = await finish(paths, opts, out)
        srt = out.with_suffix('.srt')
        return {'outputUrl': public_url(out), 'captionsUrl': public_url(srt) if srt.exists() else None, 'report': report}
    await _concat(paths, out)
    return {'outputUrl': public_url(out)}
