import asyncio,uuid
from pathlib import Path
from storage import OUTPUT_DIR,public_url,local_output
from render import ffmpeg_bin

async def extract_last_frame(video:Path)->Path:
 """Saves the final frame of a clip as a JPEG. The next scene starts from it so action and look continue across the cut."""
 out=OUTPUT_DIR/f"{uuid.uuid4()}.jpg"
 p=await asyncio.create_subprocess_exec(ffmpeg_bin(),"-y","-sseof","-0.15","-i",str(video),"-frames:v","1","-update","1","-q:v","2",str(out),stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.PIPE)
 _,err=await p.communicate()
 if p.returncode or not out.exists() or out.stat().st_size==0:raise RuntimeError(err.decode(errors="ignore")[-1500:] or "Could not extract the last frame")
 return out

async def last_frame_url(video_url:str)->str|None:
 """Best effort: a missing ffmpeg or an odd clip must never fail the scene itself."""
 clip=local_output(video_url)
 if not clip:return None
 try:return public_url(await extract_last_frame(clip))
 except Exception:return None
