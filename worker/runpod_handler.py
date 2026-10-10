import asyncio
import runpod
from adapters import ADAPTERS
from render import RenderRequest,render
from voice import VoiceRequest,synthesize

async def handle(payload):
 action=payload.get("action","generate")
 if action=="generate":
  provider=payload.get("provider","ltx")
  adapter=ADAPTERS.get(provider)
  if not adapter: raise RuntimeError(f"Unknown provider: {provider}")
  url=await adapter.generate(payload["prompt"],int(payload.get("duration",5)),payload.get("imageUrl"),payload.get("width"),payload.get("height"))
  return {"status":"completed","provider":provider,"outputUrl":url}
 if action=="voice":
  return {"status":"completed","outputUrl":await synthesize(VoiceRequest(**{k:v for k,v in payload.items() if k!="action"}))}
 if action=="render":
  return {"status":"completed","outputUrl":await render(RenderRequest(**{k:v for k,v in payload.items() if k!="action"}))}
 if action=="health":
  return {"ok":True,"providers":list(ADAPTERS.keys())}
 raise RuntimeError(f"Unknown action: {action}")

def handler(job):
 try:return asyncio.run(handle(job.get("input") or {}))
 except Exception as e:return {"status":"failed","message":str(e)[-3000:]}

if __name__=="__main__":
 runpod.serverless.start({"handler":handler})
