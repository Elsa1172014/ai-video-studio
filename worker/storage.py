import os, pathlib, uuid

# Set OUTPUT_DIR to a persistent mounted directory in production.
OUTPUT_DIR=pathlib.Path(os.getenv("OUTPUT_DIR","/tmp/ai-video-output")).expanduser().resolve()
OUTPUT_DIR.mkdir(parents=True,exist_ok=True)

def output_path(ext="mp4"):
 return OUTPUT_DIR/f"{uuid.uuid4()}.{ext}"

def public_url(path):
 base=os.getenv("PUBLIC_OUTPUT_BASE_URL","").rstrip("/")
 return f"{base}/outputs/{path.name}" if base else f"/outputs/{path.name}"

def local_output(url):
 """Path of a file this worker produced, given its public URL (or None). Only the file name is used, so nothing outside OUTPUT_DIR can be addressed."""
 if not url:return None
 name=str(url).split("?",1)[0].rsplit("/",1)[-1]
 if not name or name.startswith("."):return None
 path=(OUTPUT_DIR/name).resolve()
 return path if path.parent==OUTPUT_DIR.resolve() and path.is_file() else None
