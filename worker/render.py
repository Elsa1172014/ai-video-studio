import asyncio,uuid,os,re,shutil,tempfile
from pathlib import Path
from pydantic import BaseModel,Field
from storage import OUTPUT_DIR,public_url

class RenderScene(BaseModel):
 clips:list[str]=Field(min_length=1)
 audio:str|None=None
 duration:float|None=Field(default=None,gt=0,le=1800)
 sceneId:str|None=None

class RenderRequest(BaseModel):
 music:str="none"
 musicUrl:str|None=None
 musicVolume:float=Field(default=.12,ge=0,le=.5)
 strictDuration:bool=False
 scenes:list[RenderScene]=[]
 clips:list[str]=[]  # legacy: plain ordered clip list, no audio
 width:int=Field(default=1280,ge=64,le=3840)
 height:int=Field(default=720,ge=64,le=3840)
 fps:int=Field(default=24,ge=12,le=60)

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

async def run(args:list[str]):
 # argument vector, never a shell string
 p=await asyncio.create_subprocess_exec(args[0],'-nostats','-loglevel','error',*args[1:],stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.PIPE)
 _,err=await p.communicate()
 if p.returncode:raise RuntimeError(err.decode(errors='ignore')[-3000:] or 'FFmpeg failed')

async def duration(path:Path)->float:
 # ffmpeg prints "Duration: HH:MM:SS.xx" on stderr; works without ffprobe (imageio-ffmpeg)
 p=await asyncio.create_subprocess_exec(ffmpeg_bin(),'-i',str(path),stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.PIPE)
 _,err=await p.communicate()
 m=re.search(r'Duration: (\d+):(\d+):(\d+(?:\.\d+)?)',err.decode(errors='ignore'))
 if not m:raise RuntimeError(f'Could not read media duration of {path.name}')
 return int(m.group(1))*3600+int(m.group(2))*60+float(m.group(3))

async def render(x:RenderRequest)->str:
 from fetch import fetch_media
 scenes=x.scenes or ([RenderScene(clips=x.clips)] if x.clips else [])
 if not scenes:raise RuntimeError('At least one clip is required')
 ff=ffmpeg_bin();W,H,F=x.width,x.height,x.fps
 work=Path(tempfile.mkdtemp(prefix='render-',dir=str(OUTPUT_DIR)))
 try:
  scene_files=[]
  for si,scene in enumerate(scenes):
   # 1. normalise every shot to the same size / fps / codec (letterbox, keep aspect)
   shots=[]
   for ci,clip in enumerate(scene.clips):
    src=fetch_media(clip,work,'.mp4');dst=work/f's{si}c{ci}.mp4'
    vf=f'scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={F}'
    await run([ff,'-y','-i',str(src),'-vf',vf,'-an','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p',str(dst)])
    shots.append(dst)
   joined=work/f's{si}.mp4';manifest=work/f's{si}.txt'
   manifest.write_text(''.join(f"file '{p.as_posix()}'\n" for p in shots),encoding='utf-8')
   await run([ff,'-y','-f','concat','-safe','0','-i',str(manifest),'-c','copy',str(joined)])
   # 2. lay the scene's narration/dialogue over it; hold the last frame if speech runs longer
   out=work/f'scene{si}.mp4'
   # explicit -t on every output: -shortest is unreliable with padded filter graphs
   vdur=await duration(joined)
   if scene.audio:
    audio=fetch_media(scene.audio,work,'.wav')
    adur=await duration(audio)
    total=scene.duration if x.strictDuration and scene.duration else max(vdur,adur)
    speed=max(1.0,adur/total)
    if x.strictDuration and speed>1.25:raise RuntimeError('التعليق الصوتي أطول من مدة المشهد. اختصر نص المشهد أو زد مدته ثم أعد الإنتاج.')
    extra=max(0,total-vdur)
    tempo=f'atempo={speed:.8f},' if x.strictDuration and speed>1 else '' 
    await run([ff,'-y','-i',str(joined),'-i',str(audio),'-filter_complex',
     f'[0:v]tpad=stop_mode=clone:stop_duration={extra:.3f}[v];[1:a]{tempo}aresample=48000,apad=whole_dur={total:.3f},atrim=duration={total:.3f}[a]',
     '-map','[v]','-map','[a]','-t',f'{total:.3f}','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-ac','2',str(out)])
   else:
    total=scene.duration if x.strictDuration and scene.duration else vdur
    await run([ff,'-y','-i',str(joined),'-f','lavfi','-t',f'{total:.3f}','-i','anullsrc=r=48000:cl=stereo','-map','0:v','-map','1:a',
     '-vf',f'tpad=stop_mode=clone:stop_duration={max(0,total-vdur):.3f}','-t',f'{total:.3f}','-c:v','libx264','-preset','veryfast','-c:a','aac','-b:a','192k','-ar','48000','-ac','2',str(out)])
   scene_files.append(out)
  # 3. join scenes in order
  manifest=work/'final.txt';manifest.write_text(''.join(f"file '{p.as_posix()}'\n" for p in scene_files),encoding='utf-8')
  final=OUTPUT_DIR/f'{uuid.uuid4()}.mp4'
  await run([ff,'-y','-f','concat','-safe','0','-i',str(manifest),'-c','copy','-movflags','+faststart',str(final)])
  if x.music != 'none' and x.musicVolume > 0:
   length=await duration(final)
   if x.music=='upload':
    if not x.musicUrl:raise RuntimeError('ارفع ملف الموسيقى أولًا.')
    music=fetch_media(x.musicUrl,work,'.wav')
   else:
    from music import compose
    music=work/'score.wav';await asyncio.to_thread(compose,music,length,x.music)
   mixed=OUTPUT_DIR/f'{uuid.uuid4()}.mp4'
   await run([ff,'-y','-i',str(final),'-stream_loop','-1','-i',str(music),'-filter_complex',f'[0:a]asplit=2[voice][side];[1:a]volume={x.musicVolume},afade=t=out:st={max(0,length-2)}:d=2[m];[m][side]sidechaincompress=threshold=0.025:ratio=6:attack=20:release=400[duck];[voice][duck]amix=inputs=2:duration=first:normalize=0[a]','-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-t',str(length),'-movflags','+faststart',str(mixed)])
   final.unlink(missing_ok=True);final=mixed
  return public_url(final)
 finally:
  shutil.rmtree(work,ignore_errors=True)
