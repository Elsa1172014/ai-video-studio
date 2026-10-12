import json,subprocess,pytest
from pathlib import Path
import batch,render,storage
from test_storage_render import duration_of

class FakeModel:
    def __init__(self):self.calls=[]
    async def generate(self,prompt,duration,image_url=None):
        self.calls.append((prompt,duration,image_url))
        out=storage.output_path()
        subprocess.run([render.ffmpeg_bin(),"-y","-f","lavfi","-i",f"testsrc2=s=160x90:r=12:d={duration+0.3}","-pix_fmt","yuv420p",str(out)],check=True,capture_output=True)
        return storage.public_url(out)

def plan(n=3,d=2):
    return {"version":1,"title":"t","totalSeconds":n*d,"scenes":[{"id":f"s{i+1}","prompt":f"p{i+1}","duration":d,"continuity":"chain" if i==1 else "fresh","imageUrl":"https://ref/x.jpg"} for i in range(n)]}

async def test_batch_makes_an_exact_length_video_and_chains_frames(tmp_path):
    m=FakeModel()
    final=await batch.run(plan(),tmp_path,adapters={"ltx":m},log=lambda *_:None)
    assert abs(duration_of(final)-6.0)<0.15          # 3 scenes x 2 s, although each clip overshoots by 0.3 s
    assert m.calls[0][2]=="https://ref/x.jpg"          # fresh scene: character reference
    assert m.calls[1][2].endswith(".jpg") and "ref" not in m.calls[1][2]   # chained scene: previous last frame
    assert m.calls[2][2]=="https://ref/x.jpg"

async def test_rerun_resumes_without_regenerating(tmp_path):
    m=FakeModel();await batch.run(plan(),tmp_path,adapters={"ltx":m},log=lambda *_:None)
    assert len(m.calls)==3
    m2=FakeModel();await batch.run(plan(),tmp_path,adapters={"ltx":m2},log=lambda *_:None)
    assert m2.calls==[]
    changed=plan();changed["scenes"][2]["prompt"]="different"
    m3=FakeModel();await batch.run(changed,tmp_path,adapters={"ltx":m3},log=lambda *_:None)
    assert [c[0] for c in m3.calls]==["different"]    # only the edited scene is redone

def test_load_plan_rejects_garbage(tmp_path):
    p=tmp_path/"p.json";p.write_text('{"version":2}')
    with pytest.raises(SystemExit):batch.load_plan(p)
    p.write_text(json.dumps({"version":1,"scenes":[{"id":"a","prompt":"","duration":5}]}))
    with pytest.raises(SystemExit):batch.load_plan(p)

async def test_unknown_provider_is_reported(tmp_path):
    with pytest.raises(SystemExit,match="Unknown provider"):
        await batch.run(plan(),tmp_path,provider="nope",adapters={"ltx":FakeModel()},log=lambda *_:None)
