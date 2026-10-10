import os,uuid,asyncio,tempfile,shutil
from pathlib import Path
from pydantic import BaseModel,Field
from storage import OUTPUT_DIR,public_url
from render import ffmpeg_bin,run

class Segment(BaseModel):
 text:str=Field(min_length=1,max_length=8000)
 voice:str="default"
 provider:str="tts"
 speaker:str="Narrator"

class VoiceRequest(BaseModel):
 language:str="ar"
 segments:list[Segment]=[]
 # legacy single-text form
 text:str|None=None
 voice:str="default"
 targetSeconds:float|None=None

async def _tts(text:str,language:str,voice:str,out:Path):
 cmd=os.getenv("TTS_GENERATE_COMMAND")
 if not cmd:raise RuntimeError("Configure TTS_GENERATE_COMMAND on the GPU worker for your approved TTS engine")
 # User text is passed through environment variables, never interpolated into the command.
 env={**os.environ,"TTS_TEXT":text,"TTS_LANGUAGE":language,"TTS_VOICE":voice,"TTS_OUTPUT":str(out)}
 p=await asyncio.create_subprocess_shell(cmd,env=env,stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.PIPE);_,err=await p.communicate()
 if p.returncode or not out.exists():raise RuntimeError(err.decode(errors="ignore")[-2000:] or "TTS failed")

async def synthesize(x:VoiceRequest)->str:
 segments=x.segments or ([Segment(text=x.text,voice=x.voice)] if x.text else [])
 if not segments:raise RuntimeError("No text to synthesize")
 work=Path(tempfile.mkdtemp(prefix="tts-",dir=str(OUTPUT_DIR)))
 try:
  parts=[]
  for i,s in enumerate(segments):
   raw=work/f"{i}.wav";await _tts(s.text,x.language,s.voice,raw)
   norm=work/f"{i}-n.wav"
   # normalise format and add a short pause between speakers
   await run([ffmpeg_bin(),"-y","-i",str(raw),"-af","aresample=48000,apad=pad_dur=0.35","-ac","2","-ar","48000",str(norm)])
   parts.append(norm)
  manifest=work/"list.txt";manifest.write_text("".join(f"file '{p.as_posix()}'\n" for p in parts),encoding="utf-8")
  out=OUTPUT_DIR/f"{uuid.uuid4()}.wav"
  await run([ffmpeg_bin(),"-y","-f","concat","-safe","0","-i",str(manifest),"-c","copy",str(out)])
  return public_url(out)
 finally:
  shutil.rmtree(work,ignore_errors=True)
