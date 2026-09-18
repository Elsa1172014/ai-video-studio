import os,asyncio
from .base import VideoAdapter
from storage import output_path,public_url
class WanAdapter(VideoAdapter):
 async def generate(self,prompt:str,duration:int,image_url:str|None=None)->str:
  command=os.getenv("WAN_GENERATE_COMMAND")
  if not command: raise RuntimeError("Set WAN_GENERATE_COMMAND on the GPU worker after installing the official Wan runtime and weights")
  out=output_path(); env={**os.environ,"VIDEO_PROMPT":prompt,"VIDEO_DURATION":str(duration),"VIDEO_OUTPUT":str(out),"VIDEO_IMAGE_URL":image_url or ""}
  p=await asyncio.create_subprocess_shell(command,env=env,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE);_,err=await p.communicate()
  if p.returncode!=0: raise RuntimeError(err.decode()[-2000:] or "Wan generation failed")
  if not out.exists(): raise RuntimeError("Wan command completed without an MP4 output")
  return public_url(out)
