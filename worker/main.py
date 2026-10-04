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
from voice import VoiceRequest,synthesize

app=FastAPI(title="AI Video Studio GPU Worker",version="0.4.0")
app.mount("/outputs",StaticFiles(directory=str(OUTPUT_DIR)),name="outputs")
JOB_DIR=Path(os.getenv("JOB_DIR",str(OUTPUT_DIR/"jobs"))).expanduser().resolve()
JOB_DIR.mkdir(parents=True,exist_ok=True)
JOBS={}
TASKS={}
# One GPU: run generation jobs one at a time; voice/render are CPU-bound ffmpeg/TTS work.
GPU_LOCK=asyncio.Semaphore(int(os.getenv("GPU_CONCURRENCY","1")))

class Generate(BaseModel):
 provider:str="ltx";prompt:str=Field(min_length=3,max_length=4000);duration:int=Field(default=5,ge=1,le=30);imageUrl:Optional[str]=None
 width:Optional[int]=Field(default=None,ge=64,le=2048);height:Optional[int]=Field(default=None,ge=64,le=2048)

def auth(v):
 key=os.getenv("GPU_API_KEY")
 if key and v!=f"Bearer {key}":raise HTTPException(401,"Invalid API key")

def safe_job_id(job:str):
 try:return str(uuid.UUID(job))
 except ValueError:raise HTTPException(404,"Job not found")

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
  data=json.loads(path.read_text(encoding="utf-8"))
  # a job that was running when the worker restarted can never finish
  if data.get("status") in("queued","processing"):data.update(status="failed",message="Worker restarted while this job was running. Retry it.")
  JOBS[job]=data;return data
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

def start(kind,work,lock=None):
 job=str(uuid.uuid4())
 JOBS[job]={"jobId":job,"kind":kind,"status":"queued"};save_job(job)
 async def runner():
  try:
   if lock:
    async with lock:
     JOBS[job]["status"]="processing";save_job(job)
     url=await work()
   else:
    JOBS[job]["status"]="processing";save_job(job)
    url=await work()
   JOBS[job].update(status="completed",outputUrl=url,message="Done")
  except asyncio.CancelledError:
   JOBS[job].update(status="cancelled",message="Cancelled")
  except Exception as e:
   JOBS[job].update(status="failed",message=str(e)[-3000:])
  finally:
   save_job(job);TASKS.pop(job,None)
 TASKS[job]=asyncio.create_task(runner())
 return JOBS[job]

@app.get("/health")
def health():
 return {"ok":True,"version":app.version,"providers":list(ADAPTERS.keys()),"tts":bool(os.getenv("TTS_GENERATE_COMMAND")),"gpu":gpu_info(),"output_dir":str(OUTPUT_DIR),"job_dir":str(JOB_DIR)}

@app.post("/generate")
async def generate(req:Generate,authorization:Optional[str]=Header(None)):
 auth(authorization)
 adapter=ADAPTERS.get(req.provider)
 if not adapter:raise HTTPException(400,f"Unknown provider: {req.provider}")
 return start("generate",lambda:adapter.generate(req.prompt,req.duration,req.imageUrl,req.width,req.height),GPU_LOCK)

@app.post("/voice")
async def voice(req:VoiceRequest,authorization:Optional[str]=Header(None)):
 auth(authorization);return start("voice",lambda:synthesize(req))

@app.post("/render")
async def final_render(req:RenderRequest,authorization:Optional[str]=Header(None)):
 auth(authorization);return start("render",lambda:render(req))

@app.get("/jobs/{job}")
def status(job:str,authorization:Optional[str]=Header(None)):
 auth(authorization);data=load_job(safe_job_id(job))
 if not data:raise HTTPException(404,"Job not found")
 return data

@app.post("/jobs/{job}/cancel")
def cancel(job:str,authorization:Optional[str]=Header(None)):
 auth(authorization);job=safe_job_id(job);task=TASKS.get(job)
 if task:task.cancel()
 data=load_job(job)
 if not data:raise HTTPException(404,"Job not found")
 return data

@app.post("/media")
async def media(file:UploadFile=File(...),authorization:Optional[str]=Header(None)):
 auth(authorization);return await save_upload(file)
