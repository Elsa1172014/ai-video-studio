import os,uuid,asyncio
from typing import Optional
from fastapi import FastAPI,Header,HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel,Field
from storage import OUTPUT_DIR
from adapters import ADAPTERS
app=FastAPI(title="AI Video Studio GPU Worker",version="0.2.0")
app.mount("/outputs",StaticFiles(directory=str(OUTPUT_DIR)),name="outputs")
JOBS={}
class Generate(BaseModel):
 provider:str="wan";prompt:str=Field(min_length=3);duration:int=Field(default=5,ge=1,le=30);imageUrl:Optional[str]=None
def auth(v):
 key=os.getenv("GPU_API_KEY")
 if key and v!=f"Bearer {key}":raise HTTPException(401,"Invalid API key")
async def execute(job,req):
 JOBS[job]["status"]="processing"
 try:
  adapter=ADAPTERS.get(req.provider)
  if not adapter:raise RuntimeError(f"Unknown provider: {req.provider}")
  url=await adapter.generate(req.prompt,req.duration,req.imageUrl);JOBS[job].update(status="completed",outputUrl=url,message="Video generated")
 except Exception as e:JOBS[job].update(status="failed",message=str(e))
@app.get("/health")
def health():return {"ok":True,"providers":list(ADAPTERS.keys())}
@app.post("/generate")
async def generate(req:Generate,authorization:Optional[str]=Header(None)):
 auth(authorization);job=str(uuid.uuid4());JOBS[job]={"jobId":job,"status":"queued","provider":req.provider};asyncio.create_task(execute(job,req));return JOBS[job]
@app.get("/jobs/{job}")
def status(job:str,authorization:Optional[str]=Header(None)):
 auth(authorization)
 if job not in JOBS:raise HTTPException(404,"Job not found")
 return JOBS[job]
