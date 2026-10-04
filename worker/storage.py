import os, pathlib, uuid, mimetypes

# Set OUTPUT_DIR to a persistent mounted directory in production.
OUTPUT_DIR=pathlib.Path(os.getenv("OUTPUT_DIR","/tmp/ai-video-output")).expanduser().resolve()
OUTPUT_DIR.mkdir(parents=True,exist_ok=True)

def output_path(ext="mp4"):
 return OUTPUT_DIR/f"{uuid.uuid4()}.{ext}"

def s3_configured():
 return all(os.getenv(k) for k in ("S3_BUCKET","S3_ACCESS_KEY_ID","S3_SECRET_ACCESS_KEY"))

def _upload_s3(path:pathlib.Path)->str:
 import boto3
 region=os.getenv("S3_REGION","auto")
 client=boto3.client("s3",endpoint_url=os.getenv("S3_ENDPOINT") or None,region_name=None if region=="auto" else region,
  aws_access_key_id=os.getenv("S3_ACCESS_KEY_ID"),aws_secret_access_key=os.getenv("S3_SECRET_ACCESS_KEY"))
 key=f"{os.getenv('S3_PREFIX','generated').strip('/')}/{path.name}"
 ctype=mimetypes.guess_type(path.name)[0] or "application/octet-stream"
 client.upload_file(str(path),os.getenv("S3_BUCKET"),key,ExtraArgs={"ContentType":ctype})
 base=os.getenv("S3_PUBLIC_BASE_URL","").rstrip("/")
 if not base:
  endpoint=(os.getenv("S3_ENDPOINT") or f"https://s3.{region}.amazonaws.com").rstrip("/")
  base=f"{endpoint}/{os.getenv('S3_BUCKET')}"
 return f"{base}/{key}"

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
