import asyncio,os
import runpod
from adapters import ADAPTERS
from render import RenderRequest,render
from frames import last_frame_url

async def handle(payload):
 action=payload.get("action","generate")
 if action=="generate":
  provider=payload.get("provider","ltx")
  adapter=ADAPTERS.get(provider)
  if not adapter: raise RuntimeError(f"Unknown provider: {provider}")
  url=await adapter.generate(payload["prompt"],int(payload.get("duration",5)),payload.get("imageUrl"))
  return {"status":"completed","provider":provider,"outputUrl":url,"lastFrameUrl":await last_frame_url(url)}
 if action=="render":
  return {"status":"completed","outputUrl":await render(RenderRequest(**payload))}
 if action=="health":
  return {"ok":True,"providers":list(ADAPTERS.keys())}
 raise RuntimeError(f"Unknown action: {action}")

def handler(job):
 try:return asyncio.run(handle(job.get("input") or {}))
 except Exception as e:return {"status":"failed","message":str(e)}

runpod.serverless.start({"handler":handler})
