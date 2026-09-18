import os,uuid,asyncio
from typing import Optional
from fastapi import FastAPI,Header,HTTPException
from pydantic import BaseModel,Field
app=FastAPI(title="AI Video Studio GPU Worker",version="0.1.0")
JOBS={}
class Generate(BaseModel):
    provider:str="wan"
    prompt:str=Field(min_length=3)
    duration:int=Field(default=5,ge=1,le=30)
    imageUrl:Optional[str]=None
def auth(v):
    key=os.getenv("GPU_API_KEY")
    if key and v!=f"Bearer {key}": raise HTTPException(401,"Invalid API key")
async def execute(job_id,req):
    JOBS[job_id]["status"]="processing"
    try:
        # Adapter boundary: replace this stub with Wan/LTX inference on the GPU host.
        await asyncio.sleep(1)
        JOBS[job_id].update(status="failed",message=f"{req.provider} adapter is installed at the API boundary but model weights/runtime are not configured on this host.")
    except Exception as e:JOBS[job_id].update(status="failed",message=str(e))
@app.get("/health")
def health():return {"ok":True,"providers":["wan","ltx"]}
@app.post("/generate")
async def generate(req:Generate,authorization:Optional[str]=Header(None)):
    auth(authorization); job=str(uuid.uuid4());JOBS[job]={"jobId":job,"status":"queued","provider":req.provider};asyncio.create_task(execute(job,req));return JOBS[job]
@app.get("/jobs/{job_id}")
def status(job_id:str,authorization:Optional[str]=Header(None)):
    auth(authorization);return JOBS.get(job_id) or (_ for _ in ()).throw(HTTPException(404,"Job not found"))
