import os,uuid,asyncio,json
from pathlib import Path
from typing import Optional
from fastapi import FastAPI,Header,HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel,Field
from storage import OUTPUT_DIR
from adapters import ADAPTERS
from fastapi import UploadFile,File
from media import save_upload
from render import RenderRequest,render

app=FastAPI(title="AI Video Studio GPU Worker",version="0.3.0")
app.mount("/outputs",StaticFiles(directory=str(OUTPUT_DIR)),name="outputs")
JOB_DIR=Path(os.getenv("JOB_DIR",str(OUTPUT_DIR/"jobs"))).expanduser().resolve()
JOB_DIR.mkdir(parents=True,exist_ok=True)
JOBS={}

class Generate(BaseModel):
 provider:str="wan";prompt:str=Field(min_length=3);duration:int=Field(default=5,ge=1,le=30);imageUrl:Optional[str]=None

def auth(v):
 key=os.getenv("GPU_API_KEY")
 if key and v!=f"Bearer {key}":raise HTTPException(401,"Invalid API key")

def job_path(job): return JOB_DIR/f"{job}.json"

def save_job(job):
 path=job_path(job);tmp=path.with_suffix(".tmp")
 tmp.write_text(json.dumps(JOBS[job],ensure_ascii=False),encoding="utf-8")
 tmp.replace(path)

def load_job(job):
 if job in JOBS:return JOBS[job]
 path=job_path(job)
 if not path.exists():return None
 try:
  data=json.loads(path.read_text(encoding="utf-8"));JOBS[job]=data;return data
 except Exception:return None

def gpu_info():
 info={"available":False}
 try:
  import torch
  info["available"]=bool(torch.cuda.is_available());info["torch_version"]=torch.__version__;info["cuda_version"]=torch.version.cuda
  if info["available"]:
   device=torch.cuda.current_device();props=torch.cuda.get_device_properties(device);free,total=torch.cuda.mem_get_info(device)
   info.update({"device_index":device,"device_name":torch.cuda.get_device_name(device),"total_vram_gib":round(props.total_memory/(1024**3),2),"free_vram_gib":round(free/(1024**3),2),"used_vram_gib":round((total-free)/(1024**3),2),"device_count":torch.cuda.device_count()})
 except Exception as e:info["diagnostic_error"]=str(e)
 return info

async def execute(job,req):
 JOBS[job]["status"]="processing";JOBS[job]["gpu"]=gpu_info();save_job(job)
 try:
  adapter=ADAPTERS.get(req.provider)
  if not adapter:raise RuntimeError(f"Unknown provider: {req.provider}")
  url=await adapter.generate(req.prompt,req.duration,req.imageUrl)
  JOBS[job].update(status="completed",outputUrl=url,message="Video generated",gpu_after=gpu_info())
 except Exception as e:JOBS[job].update(status="failed",message=str(e),gpu_after=gpu_info())
 finally:save_job(job)

@app.get("/health")
def health():
 return {"ok":True,"version":app.version,"providers":list(ADAPTERS.keys()),"gpu":gpu_info(),"output_dir":str(OUTPUT_DIR),"job_dir":str(JOB_DIR)}

@app.post("/generate")
async def generate(req:Generate,authorization:Optional[str]=Header(None)):
 auth(authorization);job=str(uuid.uuid4())
 JOBS[job]={"jobId":job,"status":"queued","provider":req.provider,"gpu":gpu_info()};save_job(job)
 asyncio.create_task(execute(job,req));return JOBS[job]

@app.get("/jobs/{job}")
def status(job:str,authorization:Optional[str]=Header(None)):
 auth(authorization);data=load_job(job)
 if not data:raise HTTPException(404,"Job not found")
 return data

@app.post("/media")
async def media(file:UploadFile=File(...),authorization:Optional[str]=Header(None)):
 auth(authorization);return await save_upload(file)

@app.post("/render")
async def final_render(req:RenderRequest,authorization:Optional[str]=Header(None)):
 auth(authorization)
 try:return {"status":"completed","outputUrl":await render(req)}
 except Exception as e:return {"status":"failed","message":str(e)}
