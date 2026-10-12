import asyncio,uuid,os,re,shutil
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

def check_durations(paths:list[Path],durations:list[float]|None):
 if durations is None:return
 if len(durations)!=len(paths):raise RuntimeError('durations must match clips one to one')
 if any(d<=0 for d in durations):raise RuntimeError('durations must be positive')

def manifest_text(paths:list[Path])->str:
 return ''.join(f"file '{p.as_posix()}'\n" for p in paths)

async def _run(*args)->str:
 p=await asyncio.create_subprocess_exec(*args,stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.PIPE)
 _,err=await p.communicate()
 text=err.decode(errors='ignore')
 if p.returncode:raise RuntimeError(text[-3000:] or 'FFmpeg failed')
 return text

async def probe(path:Path)->tuple[int,int,float]:
 """(width, height, seconds) of a video file, read from ffmpeg's own report."""
 p=await asyncio.create_subprocess_exec(ffmpeg_bin(),'-i',str(path),stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.PIPE)
 _,err=await p.communicate();t=err.decode(errors='ignore')
 v=re.search(r'Video:.*?(\d{2,5})x(\d{2,5})',t);d=re.search(r'Duration: (\d+):(\d+):([\d.]+)',t)
 if not v or not d:raise RuntimeError(f'Not a readable video: {path.name}')
 return int(v.group(1)),int(v.group(2)),int(d.group(1))*3600+int(d.group(2))*60+float(d.group(3))

async def normalize_clip(src:Path,target:float,w:int,h:int,fps:int)->Path:
 """One clip -> exactly `target` seconds at w x h / fps. Longer clips are trimmed, shorter ones hold their last frame,
 other sizes are letterboxed. Clips from different models (or free hosted spaces) therefore join into one stream."""
 _,_,dur=await probe(src);gap=target-dur
 vf=f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps}"+(f",tpad=stop_mode=clone:stop_duration={gap:.3f}" if gap>0.02 else "")
 out=OUTPUT_DIR/f'{uuid.uuid4()}.norm.mp4'
 await _run(ffmpeg_bin(),'-y','-i',str(src),'-vf',vf,'-t',f'{target:.3f}','-an','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p',str(out))
 return out

async def render(x:RenderRequest):
 if not x.clips:raise RuntimeError('At least one clip is required')
 paths=[local_clip(c) for c in x.clips]
 check_durations(paths,x.durations)
 out=OUTPUT_DIR/f'{uuid.uuid4()}.mp4'
 manifest=OUTPUT_DIR/f'{uuid.uuid4()}.txt'
 temp=[]
 try:
  if x.durations:
   w,h,_=await probe(paths[0]);w,h=w//2*2,h//2*2   # the first clip sets the size; libx264 needs even dimensions
   fps=int(os.getenv('RENDER_FPS','24'))
   temp=[await normalize_clip(p,d,w,h,fps) for p,d in zip(paths,x.durations)]
   manifest.write_text(manifest_text(temp),encoding='utf-8')
   await _run(ffmpeg_bin(),'-y','-f','concat','-safe','0','-i',str(manifest),'-c','copy','-movflags','+faststart',str(out))
  else:
   manifest.write_text(manifest_text(paths),encoding='utf-8')
   await _run(ffmpeg_bin(),'-y','-f','concat','-safe','0','-i',str(manifest),'-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','-an',str(out))
 finally:
  for t in temp:t.unlink(missing_ok=True)
  manifest.unlink(missing_ok=True)
 if not out.exists():raise RuntimeError('FFmpeg render failed')
 return public_url(out)
