"""Runs the REAL worker (job queue, last-frame extraction, local references, exact-length render) with a stand-in for the
video model so the whole pipeline can be exercised without a GPU. Only the pixels differ: each "generated" clip is an
FFmpeg test pattern that overshoots the requested length slightly, like a real model does. NOT AI video generation."""
import asyncio,json,os,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/"worker"))
import main,render
from storage import OUTPUT_DIR,output_path,public_url

LOG=OUTPUT_DIR/"calls.jsonl"

class FakeLTX:
    async def generate(self,prompt,duration,image_url=None):
        with LOG.open("a") as f:f.write(json.dumps({"duration":duration,"imageUrl":image_url,"prompt":prompt[:60]})+"\n")
        await asyncio.sleep(float(os.getenv("FAKE_LATENCY","1.5")))
        if "FAIL_ONCE" in prompt and not (OUTPUT_DIR/".failed-once").exists():
            (OUTPUT_DIR/".failed-once").write_text("1");raise RuntimeError("simulated GPU out-of-memory")
        out=output_path()
        p=await asyncio.create_subprocess_exec(render.ffmpeg_bin(),"-y","-f","lavfi","-i",f"testsrc2=s=480x270:r=24:d={duration+0.25}","-c:v","libx264","-pix_fmt","yuv420p",str(out),stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.PIPE)
        _,err=await p.communicate()
        if p.returncode:raise RuntimeError(err.decode()[-500:])
        return public_url(out)

from adapters.auto import AutoAdapter
main.ADAPTERS["ltx"]=FakeLTX()
main.ADAPTERS["auto"]=AutoAdapter({"ltx":main.ADAPTERS["ltx"]})   # the UI defaults to "auto"
import uvicorn
uvicorn.run(main.app,host="127.0.0.1",port=int(os.getenv("PORT","8000")),log_level="warning")
