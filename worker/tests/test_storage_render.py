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
