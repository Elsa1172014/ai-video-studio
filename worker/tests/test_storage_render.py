import shutil,subprocess,pytest
from pathlib import Path
import storage,render
from render import RenderRequest,local_clip

def make_clip(name:str,color:str)->Path:
    out=storage.OUTPUT_DIR/name
    subprocess.run([render.ffmpeg_bin(),"-y","-f","lavfi","-i",f"color=c={color}:s=160x90:d=1:r=10","-pix_fmt","yuv420p",str(out)],check=True,capture_output=True)
    return out

def test_public_url_relative_without_base(monkeypatch):
    monkeypatch.delenv("PUBLIC_OUTPUT_BASE_URL",raising=False)
    assert storage.public_url(Path("/x/a.mp4"))=="/outputs/a.mp4"

def test_public_url_uses_base_and_strips_trailing_slash(monkeypatch):
    monkeypatch.setenv("PUBLIC_OUTPUT_BASE_URL","https://gpu.example.com/")
    assert storage.public_url(Path("/x/a.mp4"))=="https://gpu.example.com/outputs/a.mp4"

def test_output_path_unique_and_inside_output_dir():
    a,b=storage.output_path(),storage.output_path()
    assert a!=b and a.parent==storage.OUTPUT_DIR and a.suffix==".mp4"

def test_local_clip_resolves_url_and_strips_query():
    p=make_clip("known.mp4","red")
    assert local_clip("https://gpu.example.com/outputs/known.mp4?x=1")==p.resolve()

def test_local_clip_rejects_missing_file():
    with pytest.raises(RuntimeError,match="Clip not found"):
        local_clip("https://h/outputs/nope.mp4")

def test_local_clip_cannot_escape_output_dir():
    # only the last path segment is used, so traversal collapses to a plain name
    with pytest.raises(RuntimeError):
        local_clip("https://h/outputs/../../etc/passwd")

@pytest.mark.skipif(not shutil.which("ffmpeg"),reason="ffmpeg not installed")
async def test_render_concatenates_clips_into_playable_mp4():
    make_clip("c1.mp4","red");make_clip("c2.mp4","blue")
    url=await render.render(RenderRequest(clips=["/outputs/c1.mp4","/outputs/c2.mp4"]))
    out=storage.OUTPUT_DIR/url.rsplit("/",1)[-1]
    assert out.exists() and out.stat().st_size>0
    probe=subprocess.run([render.ffmpeg_bin(),"-i",str(out)],capture_output=True,text=True).stderr
    assert "Duration: 00:00:02" in probe or "Duration: 00:00:01.9" in probe

async def test_render_requires_clips():
    with pytest.raises(RuntimeError,match="At least one clip"):
        await render.render(RenderRequest(clips=[]))

def duration_of(path):
    import re
    probe=subprocess.run([render.ffmpeg_bin(),"-i",str(path)],capture_output=True,text=True).stderr
    h,m,s=re.search(r"Duration: (\d+):(\d+):([\d.]+)",probe).groups()
    return int(h)*3600+int(m)*60+float(s)

@pytest.mark.skipif(not shutil.which("ffmpeg"),reason="ffmpeg not installed")
async def test_render_trims_each_clip_to_its_planned_duration():
    # Models return "about" the requested length; here both clips run 1 s but the plan says 0.5 s + 0.75 s.
    make_clip("t1.mp4","red");make_clip("t2.mp4","blue")
    url=await render.render(RenderRequest(clips=["/outputs/t1.mp4","/outputs/t2.mp4"],durations=[0.5,0.75]))
    assert abs(duration_of(storage.OUTPUT_DIR/url.rsplit("/",1)[-1])-1.25)<0.15

async def test_render_rejects_mismatched_or_invalid_durations():
    make_clip("t3.mp4","red")
    with pytest.raises(RuntimeError,match="one to one"):
        await render.render(RenderRequest(clips=["/outputs/t3.mp4"],durations=[1,2]))
    with pytest.raises(RuntimeError,match="positive"):
        await render.render(RenderRequest(clips=["/outputs/t3.mp4"],durations=[0]))

# ---- continuity: last frame + local references ----
import frames,reference

def test_local_output_only_resolves_files_inside_output_dir():
    make_clip("lo.mp4","red")
    assert storage.local_output("https://h/outputs/lo.mp4?x=1")==(storage.OUTPUT_DIR/"lo.mp4").resolve()
    assert storage.local_output("https://h/outputs/../../etc/passwd") is None
    assert storage.local_output("https://h/outputs/missing.mp4") is None
    assert storage.local_output("https://h/outputs/.hidden") is None
    assert storage.local_output(None) is None

@pytest.mark.skipif(not shutil.which("ffmpeg"),reason="ffmpeg not installed")
async def test_last_frame_is_a_real_jpeg_from_the_clip():
    make_clip("lf.mp4","blue")
    url=await frames.last_frame_url("/outputs/lf.mp4")
    img=storage.OUTPUT_DIR/url.rsplit("/",1)[-1]
    assert url.endswith(".jpg") and img.read_bytes()[:3]==b"\xff\xd8\xff"

async def test_last_frame_is_best_effort():
    assert await frames.last_frame_url("/outputs/not-there.mp4") is None

async def test_reference_prefers_local_files_and_rejects_bad_urls(tmp_path):
    (storage.OUTPUT_DIR/"ref.jpg").write_bytes(b"\xff\xd8\xffdata")
    got=await reference.fetch_reference("http://worker.invalid/outputs/ref.jpg",tmp_path)  # would fail if it tried the network
    assert got.read_bytes()==b"\xff\xd8\xffdata" and got.parent==tmp_path
    with pytest.raises(RuntimeError,match="http"):
        await reference.fetch_reference("ftp://example.com/a.png",tmp_path)
