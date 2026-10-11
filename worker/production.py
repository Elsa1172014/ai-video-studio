"""A server-side production queue; closing a browser never stops the next scene.
Successful voice tracks and clips are cached by their exact input for retries.
"""
import asyncio, hashlib, json, tempfile, shutil, time
from pathlib import Path
from pydantic import BaseModel, Field
from storage import OUTPUT_DIR
from voice import VoiceRequest, synthesize
from render import RenderRequest, RenderScene, render, duration
from adapters import ADAPTERS

class ProductionShot(BaseModel):
 provider: str = 'wan'
 prompt: str = Field(min_length=3, max_length=4000)
 duration: int = Field(ge=1,le=10)
 imageUrl: str | None = None
 width: int | None = None
 height: int | None = None

class ReferenceImage(BaseModel):
 url:str
 name:str=''
 role:str=''

class ProductionScene(BaseModel):
 title:str=''
 narration:str=''
 evidence:list[str]=Field(default_factory=list,max_length=30)
 visual:str=''
 images:list[ReferenceImage]=Field(default_factory=list,max_length=12)
 sceneId: str
 duration: float = Field(gt=0,le=1800)
 shots: list[ProductionShot] = Field(min_length=1,max_length=360)
 voice: VoiceRequest | None = None

class ProductionRequest(BaseModel):
 method:str='cinematic'
 format:str='explainer'
 style:str=''
 execution:str=''
 music:str='none'
 musicUrl:str|None=None
 musicVolume:float=Field(default=.12,ge=0,le=.5)
 scenes: list[ProductionScene] = Field(min_length=1,max_length=120)
 width: int = Field(default=1280,ge=64,le=3840)
 height: int = Field(default=720,ge=64,le=3840)
 fps: int = Field(default=24,ge=12,le=60)
 strictDuration: bool = True

async def cached(kind, data, work):
 root=OUTPUT_DIR/'production-cache';root.mkdir(exist_ok=True)
 digest=hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
 record=root/f'{kind}-{digest}.json'
 if record.exists():
  item=json.loads(record.read_text())
  if (OUTPUT_DIR/item['url'].rsplit('/',1)[-1]).is_file():return item['url']
 url=await work()
 temp=record.with_suffix('.'+__import__('uuid').uuid4().hex+'.tmp');temp.write_text(json.dumps({'url':url}));temp.replace(record)
 return url

async def produce(req:ProductionRequest, progress, lock):
 started=time.monotonic()
 def report(message,percent,stage):
  elapsed=time.monotonic()-started
  eta=round(elapsed*(100-percent)/percent) if percent>=15 else None
  progress({'message':message,'progressPercent':round(percent,1),'stage':stage,'etaSeconds':eta})
 parts=[];done=0;total=sum(len(s.shots) for s in req.scenes)
 # Validate all voice tracks first, so an unavailable TTS service doesn't waste GPU time.
 audios=[]
 for i,s in enumerate(req.scenes):
  report(f'جارٍ تجهيز صوت المشهد {i+1} من {len(req.scenes)}',2+10*i/len(req.scenes),'voice')
  if not s.voice:audios.append(None);continue
  async def voice(v=s.voice):
   for attempt in range(3):
    try:return await synthesize(v)
    except Exception as e:
     if attempt==2:raise RuntimeError('تعذّر توليد التعليق الصوتي من خدمة الصوت. أعد المحاولة؛ ستُستخدم الأجزاء المحفوظة.') from e
     await asyncio.sleep(2*(attempt+1))
  audio=await cached('voice',s.voice.model_dump(),voice)
  if req.strictDuration:
   from fetch import fetch_media
   work=Path(tempfile.mkdtemp(prefix='voice-check-',dir=str(OUTPUT_DIR)))
   try:
    if await duration(fetch_media(audio,work,'.wav')) > s.duration*1.25:
     raise RuntimeError(f'التعليق الصوتي للمشهد {i+1} أطول من مدته. اختصر نص المشهد أو زد مدة الفيديو ثم أعد بناء المشاهد.')
   finally:shutil.rmtree(work,ignore_errors=True)
  audios.append(audio)
 for i,s in enumerate(req.scenes):
  clips=[]
  if req.method=='motion':
   from motion import generate_scene
   def motion_progress(ratio):report(f'جارٍ تحريك مشهد {i+1} من {len(req.scenes)}',12+78*(i+ratio)/len(req.scenes),'motion')
   motion_progress(0)
   async def graphics(scene=s):return await generate_scene(scene,req.width,req.height,req.format,motion_progress,req.style)
   clip=await cached('motion-v1',{'scene':s.model_dump(),'width':req.width,'height':req.height,'format':req.format,'style':req.style},graphics)
   parts.append(RenderScene(sceneId=s.sceneId,duration=s.duration,clips=[clip],audio=audios[i]))
   continue
  for shot in s.shots:
   report(f'جارٍ توليد اللقطة {done+1} من {total} — قد يستغرق التوليد السينمائي وقتًا طويلًا',12+78*done/total,'generation')
   adapter=ADAPTERS.get(shot.provider)
   if not adapter:raise RuntimeError('مزود الفيديو غير متاح.')
   async def generate(sh=shot,ad=adapter):
    async with lock:
     if sh.provider=='wan':
      def sample_progress(ratio):report(f'اللقطة {done+1} من {total} — توليد النموذج {round(ratio*100)}%',12+78*(done+ratio*.95)/total,'generation')
      return await ad.generate(sh.prompt,sh.duration,sh.imageUrl,sh.width,sh.height,progress=sample_progress)
     return await ad.generate(sh.prompt,sh.duration,sh.imageUrl,sh.width,sh.height)
   clips.append(await cached('video',shot.model_dump(),generate));done+=1
  parts.append(RenderScene(sceneId=s.sceneId,duration=s.duration,clips=clips,audio=audios[i]))
 report('اكتملت المشاهد والصوت؛ جارٍ دمج الفيديو والموسيقى',92,'render')
 return await render(RenderRequest(scenes=parts,width=req.width,height=req.height,fps=req.fps,strictDuration=req.strictDuration,music=req.music,musicUrl=req.musicUrl,musicVolume=req.musicVolume))
