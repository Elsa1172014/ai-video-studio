import asyncio,uuid
from pathlib import Path
from pydantic import BaseModel
from storage import OUTPUT_DIR,public_url

class RenderRequest(BaseModel):
 clips:list[str]
 audio:str|None=None
 captions:str|None=None

def local_clip(value:str)->Path:
 name=value.rsplit('/',1)[-1].split('?',1)[0]
 path=(OUTPUT_DIR/name).resolve()
 if path.parent!=OUTPUT_DIR.resolve() or not path.exists():raise RuntimeError(f'Clip not found: {name}')
 return path

async def render(x:RenderRequest):
 if not x.clips:raise RuntimeError('At least one clip is required')
 paths=[local_clip(c) for c in x.clips]
 manifest=OUTPUT_DIR/f'{uuid.uuid4()}.txt'
 manifest.write_text(''.join([f"file '{p.as_posix()}'\n" for p in paths]),encoding='utf-8')
 out=OUTPUT_DIR/f'{uuid.uuid4()}.mp4'
 p=await asyncio.create_subprocess_exec('ffmpeg','-y','-f','concat','-safe','0','-i',str(manifest),'-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','-an',str(out),stderr=asyncio.subprocess.PIPE)
 _,err=await p.communicate()
 if p.returncode or not out.exists():raise RuntimeError(err.decode(errors='ignore')[-2000:] or 'FFmpeg render failed')
 return public_url(out)
