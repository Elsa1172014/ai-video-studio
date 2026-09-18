import os,asyncio,json
async def transcribe(media_path:str,language:str='ar'):
 cmd=os.getenv('WHISPER_COMMAND')
 if not cmd:raise RuntimeError('Configure WHISPER_COMMAND for Whisper/WhisperX')
 env={**os.environ,'MEDIA_INPUT':media_path,'TRANSCRIBE_LANGUAGE':language};p=await asyncio.create_subprocess_shell(cmd,env=env,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE);out,err=await p.communicate()
 if p.returncode:raise RuntimeError(err.decode()[-2000:] or 'Transcription failed')
 return json.loads(out.decode())
