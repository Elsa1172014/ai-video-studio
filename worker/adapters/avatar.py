import os,asyncio
from .base import VideoAdapter
from storage import output_path,public_url
class AvatarAdapter(VideoAdapter):
 async def generate(self,prompt:str,duration:int,image_url:str|None=None)->str:
  cmd=os.getenv("AVATAR_GENERATE_COMMAND")
  if not cmd:raise RuntimeError("Configure AVATAR_GENERATE_COMMAND for LivePortrait/EchoMimic")
  out=output_path();env={**os.environ,"VIDEO_PROMPT":prompt,"VIDEO_DURATION":str(duration),"VIDEO_OUTPUT":str(out),"VIDEO_IMAGE_URL":image_url or ""}
  p=await asyncio.create_subprocess_shell(cmd,env=env,stderr=asyncio.subprocess.PIPE);_,err=await p.communicate()
  if p.returncode or not out.exists():raise RuntimeError(err.decode()[-2000:] or "Avatar generation failed")
  return public_url(out)
