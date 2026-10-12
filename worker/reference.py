import asyncio,shutil,urllib.request
from pathlib import Path
from urllib.parse import urlparse
from storage import local_output

MAX_BYTES=15*1024*1024

async def fetch_reference(image_url:str,dest_dir:Path)->Path:
 """Gets a character/continuity reference image into dest_dir. Our own outputs (e.g. the previous scene's last frame) are copied from disk; anything else must be an http(s) image under 15 MB."""
 local=local_output(image_url)
 if local:
  target=dest_dir/("character-reference"+(local.suffix.lower() or ".jpg"))
  await asyncio.to_thread(shutil.copyfile,local,target)
  return target
 parsed=urlparse(image_url)
 if parsed.scheme not in("http","https"):raise RuntimeError("Character reference image must use an http(s) URL.")
 suffix=Path(parsed.path).suffix.lower()
 if suffix not in(".jpg",".jpeg",".png",".webp"):suffix=".jpg"
 target=dest_dir/("character-reference"+suffix)
 def download():
  request=urllib.request.Request(image_url,headers={"User-Agent":"AI-Video-Studio/1.0"})
  with urllib.request.urlopen(request,timeout=30) as response:
   if not (response.headers.get("Content-Type") or "").lower().startswith("image/"):raise RuntimeError("Character reference URL did not return an image.")
   data=response.read(MAX_BYTES+1)
   if len(data)>MAX_BYTES:raise RuntimeError("Character reference image is larger than 15 MB.")
   target.write_bytes(data)
 await asyncio.to_thread(download)
 return target
