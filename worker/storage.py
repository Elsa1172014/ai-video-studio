import os, pathlib, uuid
OUTPUT_DIR=pathlib.Path(os.getenv("OUTPUT_DIR","/tmp/ai-video-output"))
OUTPUT_DIR.mkdir(parents=True,exist_ok=True)
def output_path(ext="mp4"):
 return OUTPUT_DIR/f"{uuid.uuid4()}.{ext}"
def public_url(path):
 base=os.getenv("PUBLIC_OUTPUT_BASE_URL","").rstrip("/")
 return f"{base}/outputs/{path.name}" if base else f"/outputs/{path.name}"
