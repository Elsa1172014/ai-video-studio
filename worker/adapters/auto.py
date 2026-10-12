import os
from .base import VideoAdapter,NotConfigured

class AutoAdapter(VideoAdapter):
 """Tries the providers in order (AUTO_ORDER, default "hf,ltx,wan") and uses the first that delivers. A provider with no
 configuration is skipped; real failures are collected so the final error says what each one reported."""
 def __init__(self,registry:dict):self.registry=registry
 async def generate(self,prompt,duration,image_url=None)->str:
  order=[n.strip() for n in os.getenv("AUTO_ORDER","hf,ltx,wan").split(",") if n.strip() and n.strip()!="auto"]
  problems=[]
  for name in order:
   a=self.registry.get(name)
   if not a:continue
   try:return await a.generate(prompt,duration,image_url)
   except NotConfigured:continue
   except Exception as e:problems.append(f"{name}: {str(e).splitlines()[-1] if str(e) else e.__class__.__name__}"[:400])
  raise RuntimeError("No provider could make this scene. "+(" | ".join(problems) if problems else "None is configured: set HF_SPACES (free hosted models) or install LTX (see docs/FREE_SPACES.md)."))
