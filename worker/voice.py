import os,uuid,asyncio
from pydantic import BaseModel
from storage import OUTPUT_DIR,public_url
class VoiceRequest(BaseModel):text:str;language:str='ar';voice:str='default'
async def synthesize(x:VoiceRequest):
 cmd=os.getenv('TTS_GENERATE_COMMAND')
 if not cmd:raise RuntimeError('Configure TTS_GENERATE_COMMAND for your approved TTS engine')
 out=OUTPUT_DIR/f'{uuid.uuid4()}.wav';env={**os.environ,'TTS_TEXT':x.text,'TTS_LANGUAGE':x.language,'TTS_VOICE':x.voice,'TTS_OUTPUT':str(out)}
 p=await asyncio.create_subprocess_shell(cmd,env=env,stderr=asyncio.subprocess.PIPE);_,err=await p.communicate()
 if p.returncode or not out.exists():raise RuntimeError(err.decode()[-2000:] or 'TTS failed')
 return public_url(out)
