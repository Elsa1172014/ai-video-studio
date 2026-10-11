"""A server-side production queue; closing a browser never stops the next scene.
Successful voice tracks and clips are cached by their exact input for retries.
"""
import asyncio, hashlib, json, tempfile, shutil
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

class ProductionScene(BaseModel):
 sceneId: str
 duration: float = Field(gt=0,le=1800)
 shots: list[ProductionShot] = Field(min_length=1,max_length=360)
 voice: VoiceRequest | None = None

class ProductionRequest(BaseModel):
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
 parts=[];done=0;total=sum(len(s.shots) for s in req.scenes)
 # Validate all voice tracks first, so an unavailable TTS service doesn't waste GPU time.
 audios=[]
 for i,s in enumerate(req.scenes):
  progress(f'جارٍ تجهيز صوت المشهد {i+1} من {len(req.scenes)}')
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
  for shot in s.shots:
   progress(f'جارٍ توليد اللقطة {done+1} من {total} — يستمر العمل بعد إغلاق الصفحة')
   adapter=ADAPTERS.get(shot.provider)
   if not adapter:raise RuntimeError('مزود الفيديو غير متاح.')
   async def generate(sh=shot,ad=adapter):
    async with lock:return await ad.generate(sh.prompt,sh.duration,sh.imageUrl,sh.width,sh.height)
   clips.append(await cached('video',shot.model_dump(),generate));done+=1
  parts.append(RenderScene(sceneId=s.sceneId,duration=s.duration,clips=clips,audio=audios[i]))
 progress('اكتملت اللقطات والصوت؛ جارٍ إخراج الفيديو بالمدة المحددة')
 return await render(RenderRequest(scenes=parts,width=req.width,height=req.height,fps=req.fps,strictDuration=req.strictDuration))
