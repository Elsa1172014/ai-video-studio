import {beforeEach,describe,expect,it,vi} from 'vitest';
import {POST as render} from '@/app/api/render/route';
import {POST as generate} from '@/app/api/generate/route';
import {POST as plan} from '@/app/api/plan/route';
import {POST as voice} from '@/app/api/voice/route';
import {POST as media} from '@/app/api/media/route';
import {GET as video} from '@/app/api/video/[filename]/route';
import {GET as health} from '@/app/api/health/route';
import {GET as providers} from '@/app/api/providers/route';
import {NextRequest} from 'next/server';

const post=(url:string,body:unknown)=>new Request(url,{method:'POST',body:JSON.stringify(body)});

describe('API routes',()=>{
  beforeEach(()=>{vi.stubEnv('RUNPOD_ENDPOINT_ID','');vi.stubEnv('RUNPOD_API_KEY','');vi.stubEnv('GPU_API_URL','');});

  it('render: 400 when no clips are supplied',async()=>{
    const r=await render(post('http://x/api/render',{clips:[]}));
    expect(r.status).toBe(400);expect((await r.json()).message).toMatch(/No clips/);
  });
  it('generate: invalid body returns 500 error JSON (zod)',async()=>{
    const r=await generate(post('http://x/api/generate',{prompt:'x',duration:5}));
    expect(r.status).toBe(500);
  });
  it('generate: without GPU configured returns a failed job, not a crash',async()=>{
    const r=await generate(post('http://x/api/generate',{prompt:'a cat',duration:5}));
    expect((await r.json()).status).toBe('failed');
  });
  it('plan: creates ≥3 scenes and bounds count at 30',async()=>{
    const small=await (await plan(post('http://x/api/plan',{prompt:'topic',minutes:1}))).json();
    expect(small.scenes.length).toBe(3);
    const big=await (await plan(post('http://x/api/plan',{prompt:'topic',minutes:60}))).json();
    expect(big.scenes.length).toBe(30);
  });
  it('voice: reports unconfigured when GPU_API_URL missing',async()=>{
    const d=await (await voice(post('http://x/api/voice',{text:'مرحبا'}))).json();
    expect(d.status).toBe('unconfigured');
  });
  it('media: 400 without file, 413 over 100MB, unconfigured otherwise',async()=>{
    const empty=new FormData();
    expect((await media(new Request('http://x',{method:'POST',body:empty}))).status).toBe(400);
    const big=new FormData();big.set('file',new File([new Uint8Array(100*1024*1024+1)],'big.mp4'));
    expect((await media(new Request('http://x',{method:'POST',body:big}))).status).toBe(413);
    const ok=new FormData();ok.set('file',new File(['abc'],'a.png'));
    expect((await (await media(new Request('http://x',{method:'POST',body:ok}))).json()).status).toBe('unconfigured');
  });
  it('video: rejects path traversal and non-mp4 names',async()=>{
    for(const name of ['..%2F..%2Fetc%2Fpasswd','a.txt','a b.mp4','x.mp4.exe']){
      const r=await video(new NextRequest('http://x/api/video/'+name),{params:Promise.resolve({filename:decodeURIComponent(name)})});
      expect(r.status).toBe(400);
    }
  });
  it('video: 503 when GPU endpoint is not configured',async()=>{
    const r=await video(new NextRequest('http://x/api/video/a.mp4'),{params:Promise.resolve({filename:'a.mp4'})});
    expect(r.status).toBe(503);
  });
  it('video: proxies range requests and passes 206 headers through',async()=>{
    vi.stubEnv('GPU_API_URL','https://gpu.example.com');
    const f=vi.fn().mockResolvedValue(new Response('abc',{status:206,headers:{'content-type':'video/mp4','content-range':'bytes 0-2/10'}}));
    vi.stubGlobal('fetch',f);
    const r=await video(new NextRequest('http://x/api/video/a.mp4',{headers:{range:'bytes=0-2'}}),{params:Promise.resolve({filename:'a.mp4'})});
    expect(r.status).toBe(206);expect(r.headers.get('content-range')).toBe('bytes 0-2/10');
    expect(f.mock.calls[0][1].headers.Range).toBe('bytes=0-2');
    expect(f.mock.calls[0][0]).toBe('https://gpu.example.com/outputs/a.mp4');
  });
  it('video: 502 when upstream is not an MP4',async()=>{
    vi.stubEnv('GPU_API_URL','https://gpu.example.com');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<html>ngrok</html>',{status:200,headers:{'content-type':'text/html'}})));
    const r=await video(new NextRequest('http://x/api/video/a.mp4'),{params:Promise.resolve({filename:'a.mp4'})});
    expect(r.status).toBe(502);
  });
  it('health: gpu-unconfigured when nothing is set',async()=>{
    expect((await (await health()).json()).status).toBe('gpu-unconfigured');
  });
  it('health: runpod-ready when endpoint responds OK',async()=>{
    vi.stubEnv('RUNPOD_ENDPOINT_ID','e');vi.stubEnv('RUNPOD_API_KEY','k');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:200})));
    const d=await (await health()).json();expect(d).toMatchObject({gpu:true,status:'runpod-ready'});
  });
  it('providers: lists wan and ltx',async()=>{
    const d=await (await providers()).json();
    expect(d.providers.map((p:{id:string})=>p.id)).toEqual(expect.arrayContaining(['wan','ltx']));
  });
});
