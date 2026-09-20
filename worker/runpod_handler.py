import asyncio,os
import runpod
from adapters import ADAPTERS
from render import RenderRequest,render

async def handle(payload):
 action=payload.get("action","generate")
 if action=="generate":
  provider=payload.get("provider","ltx")
  adapter=ADAPTERS.get(provider)
  if not adapter: raise RuntimeError(f"Unknown provider: {provider}")
  return {"status":"completed","provider":provider,"outputUrl":await adapter.generate(payload["prompt"],int(payload.get("duration",5)),payload.get("imageUrl"))}
 if action=="render":
  return {"status":"completed","outputUrl":await render(RenderRequest(**payload))}
 if action=="health":
  return {"ok":True,"providers":list(ADAPTERS.keys())}
 raise RuntimeError(f"Unknown action: {action}")

def handler(job):
 try:return asyncio.run(handle(job.get("input") or {}))
 except Exception as e:return {"status":"failed","message":str(e)}

runpod.serverless.start({"handler":handler})
