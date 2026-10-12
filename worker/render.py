import asyncio,uuid,os,shutil
from pathlib import Path
from pydantic import BaseModel
from storage import OUTPUT_DIR,public_url

class RenderRequest(BaseModel):
 clips:list[str]
 # Planned length of each clip in seconds. Models return "about" the requested length, so every clip is trimmed to
 # its planned duration and the final video is cut at the sum: the user's chosen length is the exact result.
 durations:list[float]|None=None
 audio:str|None=None
 captions:str|None=None

def local_clip(value:str)->Path:
 name=value.rsplit('/',1)[-1].split('?',1)[0]
 path=(OUTPUT_DIR/name).resolve()
 if path.parent!=OUTPUT_DIR.resolve() or not path.exists():raise RuntimeError(f'Clip not found: {name}')
 return path

def ffmpeg_bin()->str:
 configured=os.getenv('FFMPEG_BIN')
 if configured and Path(configured).exists():return configured
 found=shutil.which('ffmpeg')
 if found:return found
 try:
  import imageio_ffmpeg
  return imageio_ffmpeg.get_ffmpeg_exe()
 except Exception as e:
  raise RuntimeError('FFmpeg executable was not found. Install ffmpeg or imageio-ffmpeg, or set FFMPEG_BIN.') from e

def manifest_text(paths:list[Path],durations:list[float]|None)->str:
 if durations is not None and len(durations)!=len(paths):raise RuntimeError('durations must match clips one to one')
 lines=[]
 for i,p in enumerate(paths):
  lines.append(f"file '{p.as_posix()}'\n")
  if durations is not None:
   if durations[i]<=0:raise RuntimeError('durations must be positive')
   lines.append(f"outpoint {durations[i]:.3f}\n")
 return ''.join(lines)

async def render(x:RenderRequest):
 if not x.clips:raise RuntimeError('At least one clip is required')
 paths=[local_clip(c) for c in x.clips]
 manifest=OUTPUT_DIR/f'{uuid.uuid4()}.txt'
 manifest.write_text(manifest_text(paths,x.durations),encoding='utf-8')
 out=OUTPUT_DIR/f'{uuid.uuid4()}.mp4'
 ffmpeg=ffmpeg_bin()
 p=await asyncio.create_subprocess_exec(ffmpeg,'-y','-f','concat','-safe','0','-i',str(manifest),*(['-t',f'{sum(x.durations):.3f}'] if x.durations else []),'-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','-an',str(out),stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.PIPE)
 _,err=await p.communicate()
 if p.returncode or not out.exists():raise RuntimeError(err.decode(errors='ignore')[-3000:] or 'FFmpeg render failed')
 return public_url(out)
