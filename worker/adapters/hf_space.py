"""Free hosted video models: calls Gradio apps (e.g. Hugging Face Spaces) through Gradio's public HTTP API.

Spaces differ in endpoint name and argument order, so each one is described in a config list (HF_SPACES_FILE / HF_SPACES):

  [{"name":"my-ltx","url":"https://owner-space.hf.space","api_name":"/generate",
    "args":["{prompt}","{image}","{duration}","{seed}"],"output":0,"max_duration":8}]

"args" is the Space's own input list; the strings "{prompt}", "{duration}", "{seed}" and "{image}" are filled in, anything
else is passed through unchanged. Several Spaces form a fallback chain. A Space that reports an exhausted quota is skipped
for a while so the following scenes do not wait on it. Quotas, queues and availability belong to the Space and are not under our control.
"""
import asyncio,json,os,random,re,time
from pathlib import Path
from urllib.parse import urlparse
import httpx
from .base import VideoAdapter,NotConfigured
from storage import OUTPUT_DIR,output_path,public_url,local_output
from render import ffmpeg_bin

QUOTA=re.compile(r"quota|exceeded your|zerogpu|too many requests|rate limit",re.I)
COOLDOWN_SECONDS=15*60
MAX_DOWNLOAD=300*1024*1024
HF_HOSTS=(".hf.space","huggingface.co")

def parse_sse(text:str):
 """Yields (event, data) pairs from a Server-Sent-Events body."""
 event,data="message",[]
 for line in text.splitlines()+[""]:
  if line.startswith("event:"):event=line[6:].strip()
  elif line.startswith("data:"):data.append(line[5:].lstrip())
  elif line=="" and (data or event!="message"):
   yield event,"\n".join(data);event,data="message",[]

def file_url(item,base:str)->str|None:
 """Finds the file in one Gradio output value (FileData dict, {"video":...} wrapper, URL or server path)."""
 if isinstance(item,dict):
  for k in("video","value"):
   if isinstance(item.get(k),(dict,str)):return file_url(item[k],base)
  if item.get("url"):return item["url"]
  if item.get("path"):return f"{base}/gradio_api/file={item['path']}"
 if isinstance(item,str):
  if item.startswith("http"):return item
  if item.startswith("/"):return f"{base}/gradio_api/file={item}"
 return None

def _message(data:str)->str:
 try:v=json.loads(data)
 except ValueError:v=data
 return str(v)[:300] if v not in(None,"") else "the Space reported an error"

def build_args(template:list,prompt:str,duration:float,seed:int,image):
 out=[]
 for a in template:
  if a=="{prompt}":out.append(prompt)
  elif a=="{duration}":out.append(duration)
  elif a=="{seed}":out.append(seed)
  elif a=="{image}":out.append(image)
  else:out.append(a)
 return out

class SpaceConfig:
 def __init__(self,d:dict):
  d={k:v for k,v in d.items() if not k.startswith('_')}
  for k in("name","url","api_name","args"):
   if k not in d:raise ValueError(f"Space config needs '{k}'")
  self.name=str(d["name"]);self.base=str(d["url"]).rstrip("/");self.api=str(d["api_name"]).lstrip("/")
  if not self.base.startswith("https://"):raise ValueError(f"Space '{self.name}': url must be https")
  if not isinstance(d["args"],list):raise ValueError(f"Space '{self.name}': args must be a list")
  self.args=d["args"];self.output=int(d.get("output",0));self.max_duration=float(d.get("max_duration",10));self.timeout=float(d.get("timeout",600))
  self.host=urlparse(self.base).hostname or ""
  self.needs_image="{image}" in self.args

def load_configs(env=os.environ)->list[SpaceConfig]:
 raw=env.get("HF_SPACES")
 if not raw and env.get("HF_SPACES_FILE"):raw=Path(env["HF_SPACES_FILE"]).read_text(encoding="utf-8")
 if not raw:
  default=Path(__file__).resolve().parent.parent/"spaces.json"
  raw=default.read_text(encoding="utf-8") if default.exists() else ""
 if not raw.strip():return []
 try:data=json.loads(raw)
 except json.JSONDecodeError as e:raise ValueError(f"HF_SPACES is not valid JSON: {e}")
 if not isinstance(data,list):raise ValueError("HF_SPACES must be a JSON list")
 return [SpaceConfig(d) for d in data]

class HFSpaceAdapter(VideoAdapter):
 def __init__(self,configs=None,token:str|None=None,transport=None,now=time.monotonic):
  self._configs=configs;self.token=token if token is not None else os.getenv("HF_TOKEN","");self.transport=transport;self.now=now;self.cool:dict[str,float]={};self.prefix:dict[str,str]={}

 def configs(self)->list[SpaceConfig]:
  if self._configs is None:self._configs=load_configs()
  return self._configs

 def _headers(self,cfg:SpaceConfig)->dict:
  # The token is only ever sent to Hugging Face hosts, never to another site a config might name.
  return {"Authorization":f"Bearer {self.token}"} if self.token and cfg.host.endswith(HF_HOSTS) else {}

 def _allowed_download(self,url:str,cfg:SpaceConfig)->bool:
  host=urlparse(url).hostname or ""
  return urlparse(url).scheme=="https" and (host==cfg.host or host.endswith(HF_HOSTS))

 async def _post(self,client,cfg,path,**kw):
  """Gradio 5 serves under /gradio_api, Gradio 3/4 at the root: try the new prefix, then the old one."""
  for prefix in([self.prefix[cfg.base]] if cfg.base in self.prefix else["/gradio_api",""]):
   r=await client.post(f"{cfg.base}{prefix}/{path}",headers=self._headers(cfg),**kw)
   if r.status_code!=404:self.prefix[cfg.base]=prefix;return r,prefix
  return r,prefix

 async def _upload(self,client,cfg,image_url:str):
  local=local_output(image_url)
  if local:name,data=local.name,local.read_bytes()
  else:
   if urlparse(image_url).scheme not in("http","https"):raise RuntimeError("Reference image must be an http(s) URL")
   r=await client.get(image_url,follow_redirects=True)
   if r.status_code!=200 or not r.headers.get("content-type","").startswith("image/"):raise RuntimeError("Reference image could not be downloaded")
   name,data=Path(urlparse(image_url).path).name or "reference.jpg",r.content[:15*1024*1024]
  r,_=await self._post(client,cfg,"upload",files={"files":(name,data)})
  if r.status_code!=200:raise RuntimeError(f"Upload to {cfg.name} failed (HTTP {r.status_code})")
  return {"path":r.json()[0],"meta":{"_type":"gradio.FileData"}}

 async def _run_space(self,cfg:SpaceConfig,prompt:str,duration:int,image_url:str|None)->str:
  async with httpx.AsyncClient(transport=self.transport,timeout=httpx.Timeout(cfg.timeout,connect=20)) as client:
   image=await self._upload(client,cfg,image_url) if (image_url and cfg.needs_image) else None
   args=build_args(cfg.args,prompt,min(float(duration),cfg.max_duration),random.randint(0,2**31-1),image)
   r,prefix=await self._post(client,cfg,f"call/{cfg.api}",json={"data":args})
   if r.status_code!=200:raise RuntimeError(f"{cfg.name}: HTTP {r.status_code} {r.text[:200]}")
   event_id=r.json().get("event_id")
   if not event_id:raise RuntimeError(f"{cfg.name}: no event id returned")
   s=await client.get(f"{cfg.base}{prefix}/call/{cfg.api}/{event_id}",headers=self._headers(cfg))
   result=None
   for event,data in parse_sse(s.text):
    if event=="complete":result=json.loads(data);break
    if event=="error":raise RuntimeError(f"{cfg.name}: {_message(data)}")
   if result is None:raise RuntimeError(f"{cfg.name}: the Space ended without a result")
   try:url=file_url(result[cfg.output],cfg.base)
   except (IndexError,TypeError):url=None
   if not url:raise RuntimeError(f"{cfg.name}: output #{cfg.output} is not a video file")
   if not self._allowed_download(url,cfg):raise RuntimeError(f"{cfg.name}: refusing to download from {urlparse(url).hostname}")
   raw=OUTPUT_DIR/f"{output_path().stem}.src"
   try:
    size=0
    async with client.stream("GET",url,headers=self._headers(cfg),follow_redirects=False) as resp:
     if resp.status_code!=200:raise RuntimeError(f"{cfg.name}: video download failed (HTTP {resp.status_code})")
     with raw.open("wb") as f:
      async for chunk in resp.aiter_bytes():
       size+=len(chunk)
       if size>MAX_DOWNLOAD:raise RuntimeError(f"{cfg.name}: video is larger than 300 MB")
       f.write(chunk)
    out=output_path()   # always H.264 MP4, whatever the Space produced
    p=await asyncio.create_subprocess_exec(ffmpeg_bin(),"-y","-i",str(raw),"-an","-c:v","libx264","-pix_fmt","yuv420p",str(out),stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.PIPE)
    _,err=await p.communicate()
    if p.returncode or not out.exists():raise RuntimeError(f"{cfg.name}: the downloaded file is not a playable video")
    return public_url(out)
   finally:raw.unlink(missing_ok=True)

 async def generate(self,prompt:str,duration:int,image_url:str|None=None)->str:
  cfgs=self.configs()
  if not cfgs:raise NotConfigured("No free Space is configured. Set HF_SPACES or create worker/spaces.json (see docs/FREE_SPACES.md).")
  errors=[]
  for cfg in cfgs:
   if self.cool.get(cfg.name,0)>self.now():errors.append(f"{cfg.name}: skipped (quota used up, retrying later)");continue
   try:return await self._run_space(cfg,prompt,duration,image_url)
   except NotConfigured:raise
   except Exception as e:
    msg=str(e) or e.__class__.__name__
    if QUOTA.search(msg):self.cool[cfg.name]=self.now()+COOLDOWN_SECONDS
    errors.append(msg if msg.startswith(cfg.name) else f"{cfg.name}: {msg}")
  raise RuntimeError("All free Spaces failed — "+" | ".join(errors))
