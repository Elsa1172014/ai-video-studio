from .base import VideoAdapter
class LTXAdapter(VideoAdapter):
 async def generate(self,prompt:str,duration:int,image_url:str|None=None)->str:
  raise RuntimeError("LTX runtime/model weights are not configured on this GPU host yet")
