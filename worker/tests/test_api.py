import asyncio,pytest
from fastapi.testclient import TestClient
import main,adapters

class StubAdapter:
    def __init__(self,fail=False):self.fail=fail;self.calls=[]
    async def generate(self,prompt,duration,image_url=None):
        self.calls.append((prompt,duration,image_url))
        if self.fail:raise RuntimeError("boom")
        return "/outputs/stub.mp4"

@pytest.fixture
def client(monkeypatch):
    monkeypatch.setitem(main.ADAPTERS,"ltx",StubAdapter())
    monkeypatch.setitem(main.ADAPTERS,"bad",StubAdapter(fail=True))
    main.JOBS.clear()
    with TestClient(main.app) as c:yield c

def wait_done(client,job,headers=None):
    for _ in range(50):
        d=client.get(f"/jobs/{job}",headers=headers).json()
        if d["status"] in("completed","failed"):return d
        import time;time.sleep(0.05)
    raise AssertionError("job did not finish")

def test_health_lists_providers(client):
    d=client.get("/health").json()
    assert d["ok"] and {"wan","ltx"}<=set(d["providers"])

def test_generate_job_lifecycle_and_image_forwarding(client):
    r=client.post("/generate",json={"provider":"ltx","prompt":"a cat","duration":3,"imageUrl":"https://i/x.jpg"})
    assert r.status_code==200
    d=wait_done(client,r.json()["jobId"])
    assert d["status"]=="completed" and d["outputUrl"]=="/outputs/stub.mp4"
    assert main.ADAPTERS["ltx"].calls==[("a cat",3,"https://i/x.jpg")]

def test_failed_adapter_marks_job_failed_with_message(client):
    jid=client.post("/generate",json={"provider":"bad","prompt":"xyz"}).json()["jobId"]
    d=wait_done(client,jid);assert d["status"]=="failed" and d["message"]=="boom"

def test_unknown_provider_fails_cleanly(client):
    jid=client.post("/generate",json={"provider":"nope","prompt":"xyz"}).json()["jobId"]
    assert "Unknown provider" in wait_done(client,jid)["message"]

@pytest.mark.parametrize("body",[{"prompt":"ab"},{"prompt":"valid","duration":0},{"prompt":"valid","duration":31}])
def test_generate_validates_input(client,body):
    assert client.post("/generate",json=body).status_code==422

def test_unknown_job_is_404(client):
    assert client.get("/jobs/does-not-exist").status_code==404

def test_job_survives_restart_via_disk(client):
    jid=client.post("/generate",json={"provider":"ltx","prompt":"persist"}).json()["jobId"]
    wait_done(client,jid);main.JOBS.clear()
    assert client.get(f"/jobs/{jid}").json()["status"]=="completed"

def test_auth_enforced_when_key_set(client,monkeypatch):
    monkeypatch.setenv("GPU_API_KEY","s3cret")
    assert client.post("/generate",json={"prompt":"valid"}).status_code==401
    assert client.get("/jobs/x",headers={"Authorization":"Bearer wrong"}).status_code==401
    ok=client.post("/generate",json={"provider":"ltx","prompt":"valid"},headers={"Authorization":"Bearer s3cret"})
    assert ok.status_code==200

def test_media_upload_roundtrip(client):
    r=client.post("/media",files={"file":("pic.png",b"\x89PNG data","image/png")})
    d=r.json();assert r.status_code==200 and d["url"].endswith(".png") and d["name"]=="pic.png"
    assert client.get(d["url"]).content==b"\x89PNG data"

def test_render_endpoint_reports_failure_for_missing_clip(client):
    d=client.post("/render",json={"clips":["/outputs/missing.mp4"]}).json()
    assert d["status"]=="failed" and "Clip not found" in d["message"]

async def test_unconfigured_command_adapters_raise_helpful_errors(monkeypatch):
    for k in("WAN_GENERATE_COMMAND","AVATAR_GENERATE_COMMAND","LIPSYNC_GENERATE_COMMAND"):monkeypatch.delenv(k,raising=False)
    for name,hint in(("wan","WAN_GENERATE_COMMAND"),("avatar","AVATAR_GENERATE_COMMAND"),("lipsync","LIPSYNC_GENERATE_COMMAND")):
        with pytest.raises(RuntimeError,match=hint):await adapters.ADAPTERS[name].generate("p",5)

async def test_command_adapter_runs_command_and_returns_url(monkeypatch):
    monkeypatch.setenv("WAN_GENERATE_COMMAND",'printf x > "$VIDEO_OUTPUT"')
    url=await adapters.ADAPTERS["wan"].generate("p",5)
    assert url.startswith("/outputs/") and url.endswith(".mp4")

def test_completed_job_exposes_last_frame_url(client,monkeypatch):
    import frames
    async def fake(url):return "/outputs/frame.jpg"
    monkeypatch.setattr(main,"last_frame_url",fake)
    jid=client.post("/generate",json={"provider":"ltx","prompt":"a cat"}).json()["jobId"]
    d=wait_done(client,jid);assert d["status"]=="completed" and d["lastFrameUrl"]=="/outputs/frame.jpg"

def test_render_endpoint_accepts_durations(client):
    d=client.post("/render",json={"clips":["/outputs/missing.mp4"],"durations":[2]}).json()
    assert d["status"]=="failed" and "Clip not found" in d["message"]
