import os,pathlib,urllib.request,uuid,socket,ipaddress
from urllib.parse import urlparse
from storage import OUTPUT_DIR

MAX_BYTES=int(os.getenv("MAX_FETCH_MB","1024"))*1024*1024

def local_output(value:str)->pathlib.Path|None:
 """Resolve '/outputs/<name>' or a URL on this worker's PUBLIC_OUTPUT_BASE_URL to a local file."""
 base=os.getenv("PUBLIC_OUTPUT_BASE_URL","").rstrip("/")
 if value.startswith("/outputs/") or (base and value.startswith(base+"/outputs/")):
  name=value.rsplit("/",1)[-1].split("?",1)[0]
  path=(OUTPUT_DIR/name).resolve()
  if path.parent!=OUTPUT_DIR.resolve() or not path.exists():raise RuntimeError(f"Output not found: {name}")
  return path
 return None

def assert_public_url(value:str):
 """http(s) only; hosts must resolve to public addresses unless listed in MEDIA_ALLOWED_HOSTS."""
 parsed=urlparse(value)
 if parsed.scheme not in("http","https") or not parsed.hostname:raise RuntimeError("Media must be an http(s) URL")
 allowed={h.strip().lower() for h in os.getenv("MEDIA_ALLOWED_HOSTS","").split(",") if h.strip()}
 if parsed.hostname.lower() in allowed:return
 for info in socket.getaddrinfo(parsed.hostname,None):
  ip=ipaddress.ip_address(info[4][0])
  if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
   raise RuntimeError("Media URL resolves to a private address")

def fetch_media(value:str,dest_dir:pathlib.Path,suffix:str)->pathlib.Path:
 """Local output path, or download an http(s) URL with a size cap (no other schemes)."""
 local=local_output(value)
 if local:return local
 assert_public_url(value)
 out=dest_dir/f"{uuid.uuid4()}{suffix}"
 req=urllib.request.Request(value,headers={"User-Agent":"AI-Video-Studio/1.0"})
 with urllib.request.urlopen(req,timeout=120) as r, out.open("wb") as f:
  total=0
  while True:
   chunk=r.read(1<<20)
   if not chunk:break
   total+=len(chunk)
   if total>MAX_BYTES:raise RuntimeError("Media file is too large")
   f.write(chunk)
 return out
