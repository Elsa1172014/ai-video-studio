import os, pathlib, uuid, mimetypes
from urllib.parse import unquote

# Set OUTPUT_DIR to a persistent mounted directory in production.
OUTPUT_DIR=pathlib.Path(os.getenv("OUTPUT_DIR","/tmp/ai-video-output")).expanduser().resolve()
OUTPUT_DIR.mkdir(parents=True,exist_ok=True)

def output_path(ext="mp4"):
 return OUTPUT_DIR/f"{uuid.uuid4()}.{ext}"

# ---- optional S3-compatible object storage (AWS S3, Cloudflare R2, B2, MinIO) ----
def s3_configured():
 return all(os.getenv(k) for k in ("S3_BUCKET","S3_ACCESS_KEY_ID","S3_SECRET_ACCESS_KEY"))

def _region():
 return os.getenv("S3_REGION","auto")

def _client():
 import boto3
 return boto3.client("s3",endpoint_url=os.getenv("S3_ENDPOINT") or None,region_name=None if _region()=="auto" else _region(),
  aws_access_key_id=os.getenv("S3_ACCESS_KEY_ID"),aws_secret_access_key=os.getenv("S3_SECRET_ACCESS_KEY"))

def _base_url():
 base=os.getenv("S3_PUBLIC_BASE_URL","").rstrip("/")
 if base:return base
 endpoint=(os.getenv("S3_ENDPOINT") or f"https://s3.{_region()}.amazonaws.com").rstrip("/")
 return f"{endpoint}/{os.getenv('S3_BUCKET')}"

def _upload_s3(path:pathlib.Path)->str:
 key=f"{os.getenv('S3_PREFIX','generated').strip('/')}/{path.name}"
 ctype=mimetypes.guess_type(path.name)[0] or "application/octet-stream"
 _client().upload_file(str(path),os.getenv("S3_BUCKET"),key,ExtraArgs={"ContentType":ctype})
 return f"{_base_url()}/{key}"

def s3_download(url:str,dest:pathlib.Path)->bool:
 """Fetch an object of our own bucket with credentials (works for private buckets too)."""
 if not s3_configured() or not url.startswith(_base_url()+"/"):return False
 key=unquote(url[len(_base_url())+1:].split("?",1)[0])
 _client().download_file(os.getenv("S3_BUCKET"),key,str(dest))
 return True

def public_url(path):
 """Durable URL for a generated file: object storage when configured, else the worker's /outputs."""
 path=pathlib.Path(path)
 if s3_configured():
  url=_upload_s3(path)
  if os.getenv("KEEP_LOCAL_OUTPUTS","0")!="1":
   try:path.unlink()
   except OSError:pass
  return url
 base=os.getenv("PUBLIC_OUTPUT_BASE_URL","").rstrip("/")
 return f"{base}/outputs/{path.name}" if base else f"/outputs/{path.name}"
