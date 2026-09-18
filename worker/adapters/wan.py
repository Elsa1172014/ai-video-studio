from .base import VideoAdapter
class WanAdapter(VideoAdapter):
 async def generate(self,prompt:str,duration:int,image_url:str|None=None)->str:
  raise RuntimeError("Wan runtime/model weights are not configured on this GPU host yet")
