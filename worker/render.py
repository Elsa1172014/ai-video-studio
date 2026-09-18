import asyncio,uuid
from pydantic import BaseModel
from storage import OUTPUT_DIR,public_url
class RenderRequest(BaseModel):clips:list[str];audio:str|None=None;captions:str|None=None
async def render(x:RenderRequest):
 if not x.clips:raise RuntimeError('At least one clip is required')
 manifest=OUTPUT_DIR/f'{uuid.uuid4()}.txt';manifest.write_text(''.join([f"file '{c}'\n" for c in x.clips]))
 out=OUTPUT_DIR/f'{uuid.uuid4()}.mp4'
 # clips are expected to be local worker output paths/URLs; production storage adapters can materialize remote assets first.
 p=await asyncio.create_subprocess_exec('ffmpeg','-y','-f','concat','-safe','0','-i',str(manifest),'-c','copy',str(out),stderr=asyncio.subprocess.PIPE);_,err=await p.communicate()
 if p.returncode or not out.exists():raise RuntimeError(err.decode()[-2000:] or 'FFmpeg render failed')
 return public_url(out)
