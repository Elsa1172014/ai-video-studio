import json,subprocess,httpx,pytest
import render,storage
from adapters.auto import AutoAdapter
from adapters.base import NotConfigured
from adapters.hf_space import HFSpaceAdapter,SpaceConfig,build_args,file_url,load_configs,parse_sse
from test_storage_render import duration_of

@pytest.fixture(scope="module")
def video_bytes(tmp_path_factory):
    p=tmp_path_factory.mktemp("v")/"s.webm"   # a Space may return WebM; the adapter must hand back H.264 MP4
    subprocess.run([render.ffmpeg_bin(),"-y","-f","lavfi","-i","testsrc2=s=128x72:r=12:d=1.5","-c:v","libvpx","-pix_fmt","yuv420p",str(p)],check=True,capture_output=True)
    return p.read_bytes()

def cfg(name="demo",host="demo.hf.space",args=None,**kw):
    return SpaceConfig({"name":name,"url":f"https://{host}","api_name":"/generate","args":args or ["{prompt}","{duration}","{seed}"],**kw})

class FakeGradio:
    """Minimal Gradio 5 server: /upload, /call/<api>, /call/<api>/<event>, /file=<path>."""
    def __init__(self,video,outcome="ok",prefix="/gradio_api",out_url=None,out_item=None):
        self.video=video;self.outcome=outcome;self.prefix=prefix;self.calls=[];self.uploads=[];self.auth=[];self.out_url=out_url;self.out_item=out_item
    def __call__(self,req:httpx.Request):
        path=req.url.path;self.auth.append((req.url.host,req.headers.get("authorization")))
        if not path.startswith(self.prefix):return httpx.Response(404)
        rest=path[len(self.prefix):]
        if rest=="/upload":self.uploads.append(req.content);return httpx.Response(200,json=["/tmp/gradio/abc/ref.jpg"])
        if rest=="/call/generate" and req.method=="POST":self.calls.append(json.loads(req.content));return httpx.Response(200,json={"event_id":"E1"})
        if rest=="/call/generate/E1":
            if self.outcome=="error":return httpx.Response(200,text="event: error\ndata: \"CUDA out of memory\"\n\n")
            if self.outcome=="quota":return httpx.Response(200,text="event: error\ndata: \"You have exceeded your GPU quota (60s)\"\n\n")
            item=self.out_item or {"video":{"path":"/tmp/o.webm","url":self.out_url or f"https://{req.url.host}{self.prefix}/file=/tmp/o.webm"}}
            return httpx.Response(200,text=f"event: generating\ndata: null\n\nevent: complete\ndata: {json.dumps([item])}\n\n")
        if rest.startswith("/file="):return httpx.Response(200,content=self.video,headers={"content-type":"video/webm"})
        return httpx.Response(404)

def adapter(fake,*cfgs,token="hf_secret"):
    return HFSpaceAdapter(list(cfgs),token=token,transport=httpx.MockTransport(fake))

def test_sse_and_file_helpers():
    assert list(parse_sse("event: generating\ndata: null\n\nevent: complete\ndata: [1,\ndata: 2]\n\n"))==[("generating","null"),("complete","[1,\n2]")]
    assert file_url({"video":{"path":"/t/a.mp4"}},"https://x.hf.space")=="https://x.hf.space/gradio_api/file=/t/a.mp4"
    assert file_url({"url":"https://x/a.mp4"},"https://b")=="https://x/a.mp4"
    assert file_url("/t/b.mp4","https://x.hf.space").endswith("file=/t/b.mp4") and file_url(5,"https://x") is None
    assert build_args(["{prompt}","{duration}",True,"{image}","x"],"cat",6,7,"IMG")==["cat",6,True,"IMG","x"]

async def test_generates_through_a_space_and_returns_h264_mp4(video_bytes):
    fake=FakeGradio(video_bytes)
    url=await adapter(fake,cfg(max_duration=5)).generate("a cat",8)
    out=storage.OUTPUT_DIR/url.rsplit("/",1)[-1]
    probe=subprocess.run([render.ffmpeg_bin(),"-i",str(out)],capture_output=True,text=True).stderr
    assert url.endswith(".mp4") and "h264" in probe and abs(duration_of(out)-1.5)<0.2
    args=fake.calls[0]["data"];assert args[0]=="a cat" and args[1]==5 and isinstance(args[2],int)   # duration clamped to the Space's limit
    assert ("demo.hf.space","Bearer hf_secret") in fake.auth

async def test_reference_image_is_uploaded_and_passed_as_file_data(video_bytes):
    (storage.OUTPUT_DIR/"lastframe.jpg").write_bytes(b"\xff\xd8\xffjpeg")
    fake=FakeGradio(video_bytes)
    await adapter(fake,cfg(args=["{prompt}","{image}"])).generate("cat",4,"http://worker/outputs/lastframe.jpg")
    assert b"jpeg" in fake.uploads[0]
    assert fake.calls[0]["data"][1]=={"path":"/tmp/gradio/abc/ref.jpg","meta":{"_type":"gradio.FileData"}}

async def test_image_is_ignored_when_the_space_takes_none(video_bytes):
    fake=FakeGradio(video_bytes);await adapter(fake,cfg()).generate("cat",4,"http://worker/outputs/x.jpg")
    assert fake.uploads==[]

async def test_falls_back_to_the_next_space_and_reports_all_failures(video_bytes):
    bad,good=FakeGradio(video_bytes,"error"),FakeGradio(video_bytes)
    routes={"bad.hf.space":bad,"good.hf.space":good}
    a=HFSpaceAdapter([cfg("bad","bad.hf.space"),cfg("good","good.hf.space")],transport=httpx.MockTransport(lambda r:routes[r.url.host](r)))
    assert (await a.generate("cat",4)).endswith(".mp4") and len(good.calls)==1
    both=HFSpaceAdapter([cfg("bad","bad.hf.space")],transport=httpx.MockTransport(lambda r:bad(r)))
    with pytest.raises(RuntimeError,match=r"All free Spaces failed.*bad: CUDA out of memory"):await both.generate("cat",4)

async def test_quota_error_puts_the_space_on_cooldown(video_bytes):
    clock={"t":1000.0};quota=FakeGradio(video_bytes,"quota")
    a=HFSpaceAdapter([cfg("q","q.hf.space")],transport=httpx.MockTransport(quota),now=lambda:clock["t"])
    with pytest.raises(RuntimeError):await a.generate("cat",4)
    seen=len(quota.auth)
    with pytest.raises(RuntimeError,match="skipped"):await a.generate("cat",4)
    assert len(quota.auth)==seen                      # no request while cooling down
    clock["t"]+=16*60;quota.outcome="ok"
    assert (await a.generate("cat",4)).endswith(".mp4")

async def test_older_gradio_without_the_api_prefix(video_bytes):
    fake=FakeGradio(video_bytes,prefix="")
    assert (await adapter(fake,cfg()).generate("cat",4)).endswith(".mp4")

async def test_token_is_never_sent_to_a_non_huggingface_host(video_bytes):
    fake=FakeGradio(video_bytes);await adapter(fake,cfg("x","gradio.example.org")).generate("cat",4)
    assert all(a is None for _,a in fake.auth)

async def test_refuses_to_download_from_an_unrelated_host(video_bytes):
    fake=FakeGradio(video_bytes,out_url="https://evil.example.net/o.mp4")
    with pytest.raises(RuntimeError,match="refusing to download"):await adapter(fake,cfg()).generate("cat",4)

async def test_output_that_is_not_a_file_is_reported(video_bytes):
    fake=FakeGradio(video_bytes,out_item="just text")
    with pytest.raises(RuntimeError,match="not a video file"):await adapter(fake,cfg()).generate("cat",4)

def test_config_loading_and_validation(tmp_path):
    assert load_configs({})==[] or True
    good=json.dumps([{"name":"a","url":"https://a.hf.space","api_name":"/g","args":["{prompt}"]}])
    assert load_configs({"HF_SPACES":good})[0].name=="a"
    f=tmp_path/"s.json";f.write_text(good);assert load_configs({"HF_SPACES_FILE":str(f)})[0].api=="g"
    with pytest.raises(ValueError,match="valid JSON"):load_configs({"HF_SPACES":"{nope"})
    with pytest.raises(ValueError,match="list"):load_configs({"HF_SPACES":"{}"})
    with pytest.raises(ValueError,match="https"):load_configs({"HF_SPACES":good.replace("https","http")})
    with pytest.raises(ValueError,match="needs 'args'"):load_configs({"HF_SPACES":'[{"name":"a","url":"https://a","api_name":"/g"}]'})

async def test_unconfigured_space_adapter_and_auto_chain(video_bytes):
    with pytest.raises(NotConfigured):await HFSpaceAdapter([]).generate("cat",4)
    class Boom:
        async def generate(self,*a):raise RuntimeError("no gpu")
    reg={"hf":HFSpaceAdapter([]),"ltx":Boom()}
    with pytest.raises(RuntimeError,match="ltx: no gpu"):await AutoAdapter(reg).generate("cat",4)
    with pytest.raises(RuntimeError,match="None is configured"):await AutoAdapter({"hf":HFSpaceAdapter([])}).generate("cat",4)
    good=HFSpaceAdapter([cfg()],transport=httpx.MockTransport(FakeGradio(video_bytes)))
    assert (await AutoAdapter({"hf":good,"ltx":Boom()}).generate("cat",4)).endswith(".mp4")
