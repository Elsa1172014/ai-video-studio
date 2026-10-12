"""Offline production runner: make the whole video from a plan exported by Story Studio, on any machine with a GPU
(your own PC, or a free notebook). No server and no web app needed.

    python batch.py plan.json --out ./out [--provider ltx]

Scenes are generated in order; a scene that continues the previous action starts from its last frame. Finished scenes are
recorded in out/state.json, so re-running the same command resumes. The result is out/final.mp4, cut to exactly the
planned length.
"""
import argparse,asyncio,hashlib,json,os,shutil,sys,time
from pathlib import Path

def _key(scene:dict)->str:
 return hashlib.sha1(f"{scene['prompt']}|{scene['duration']}|{scene.get('continuity')}|{scene.get('imageUrl','')}".encode()).hexdigest()[:12]

def load_plan(path:Path)->dict:
 plan=json.loads(path.read_text(encoding="utf-8"))
 if plan.get("version")!=1 or not plan.get("scenes"):raise SystemExit("Not a Story Studio plan (version 1 with scenes).")
 for s in plan["scenes"]:
  if not s.get("prompt") or not (0<float(s.get("duration",0))<=30):raise SystemExit(f"Bad scene in plan: {s.get('id')}")
 return plan

async def run(plan:dict,out_dir:Path,provider:str="auto",adapters=None,log=print)->Path:
 from storage import OUTPUT_DIR,local_output
 from frames import last_frame_url
 from render import RenderRequest,render
 if adapters is None:
  from adapters import ADAPTERS as adapters
 adapter=adapters.get(provider)
 if not adapter:raise SystemExit(f"Unknown provider '{provider}'. Available: {', '.join(adapters)}")
 out_dir.mkdir(parents=True,exist_ok=True)
 state_file=out_dir/"state.json"
 state=json.loads(state_file.read_text()) if state_file.exists() else {}
 scenes=plan["scenes"];done=[];t0=time.time()
 for i,s in enumerate(scenes):
  k=_key(s);hit=state.get(s["id"])
  prev_frame=state.get(scenes[i-1]["id"],{}).get("frame") if i else None
  if hit and hit["key"]==k and local_output(hit["clip"]):
   log(f"[{i+1}/{len(scenes)}] {s['id']} already done, skipping");done.append(hit["clip"]);continue
  image=prev_frame if s.get("continuity")=="chain" and prev_frame and local_output(prev_frame) else s.get("imageUrl")
  t=time.time();log(f"[{i+1}/{len(scenes)}] {s['id']} generating {s['duration']}s{' from the previous last frame' if image and image==prev_frame else ''}…")
  clip=await adapter.generate(s["prompt"],int(round(s["duration"])),image)
  frame=await last_frame_url(clip)
  state[s["id"]]={"key":k,"clip":clip,"frame":frame};state_file.write_text(json.dumps(state))
  done.append(clip);log(f"    done in {time.time()-t:.0f}s")
 log("joining scenes and cutting to the exact length…")
 url=await render(RenderRequest(clips=done,durations=[float(s["duration"]) for s in scenes]))
 final=out_dir/"final.mp4";shutil.copyfile(local_output(url),final)
 log(f"finished in {time.time()-t0:.0f}s → {final}")
 return final

def main(argv=None):
 ap=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
 ap.add_argument("plan");ap.add_argument("--out",default="out");ap.add_argument("--provider",default="auto",help="auto (free Spaces, then local models), hf, ltx, wan")
 a=ap.parse_args(argv);out=Path(a.out).resolve()
 os.environ.setdefault("OUTPUT_DIR",str(out/"clips"))  # must be set before the worker modules are imported
 sys.path.insert(0,str(Path(__file__).resolve().parent))
 asyncio.run(run(load_plan(Path(a.plan)),out,a.provider))

if __name__=="__main__":main()
