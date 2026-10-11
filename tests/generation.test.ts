import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {getGeneration,submitGeneration,submitRender} from '@/lib/generation';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

describe('lib/generation – legacy worker',()=>{
  beforeEach(()=>{
    vi.stubEnv('RUNPOD_ENDPOINT_ID','');vi.stubEnv('RUNPOD_API_KEY','');
    vi.stubEnv('GPU_API_URL','https://gpu.example.com/');vi.stubEnv('GPU_API_KEY','secret');
  });
  it('reports failure (no throw) when no GPU is configured',async()=>{
    vi.stubEnv('GPU_API_URL','');
    const r=await submitGeneration({provider:'ltx',prompt:'p',duration:5});
    expect(r.status).toBe('failed');expect(r.message).toMatch(/not configured/i);
  });
  it('sends bearer auth and absolutizes relative outputUrl',async()=>{
    const f=vi.fn().mockResolvedValue(json({jobId:'1',status:'completed',provider:'ltx',outputUrl:'/outputs/a.mp4'}));
    vi.stubGlobal('fetch',f);
    const r=await submitGeneration({provider:'ltx',prompt:'hello',duration:5});
    expect(f.mock.calls[0][0]).toBe('https://gpu.example.com/generate');
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer secret');
    expect(r.outputUrl).toBe('https://gpu.example.com/outputs/a.mp4');
  });
  it('maps 401 to a clear authentication error',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('no',{status:401})));
    await expect(getGeneration('x')).rejects.toThrow(/authentication failed/i);
  });
  it('submitRender posts clips and keeps worker status',async()=>{
    const f=vi.fn().mockResolvedValue(json({status:'completed',outputUrl:'/outputs/final.mp4'}));
    vi.stubGlobal('fetch',f);
    const r=await submitRender(['https://gpu.example.com/outputs/a.mp4']);
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({clips:['https://gpu.example.com/outputs/a.mp4']});
    expect(r.status).toBe('completed');expect(r.jobId).toBeTruthy();
  });
});

describe('lib/generation – Runpod',()=>{
  beforeEach(()=>{vi.stubEnv('RUNPOD_ENDPOINT_ID','ep1');vi.stubEnv('RUNPOD_API_KEY','rk');});
  afterEach(()=>vi.unstubAllGlobals());
  const status=(job:unknown)=>vi.stubGlobal('fetch',vi.fn().mockResolvedValue(json(job)));

  it('IN_QUEUE → queued, IN_PROGRESS → processing',async()=>{
    status({id:'j',status:'IN_QUEUE'});expect((await getGeneration('j')).status).toBe('queued');
    status({id:'j',status:'IN_PROGRESS'});expect((await getGeneration('j')).status).toBe('processing');
  });
  it('COMPLETED with absolute URL → completed',async()=>{
    status({id:'j',status:'COMPLETED',output:{outputUrl:'https://cdn/x.mp4'}});
    const r=await getGeneration('j');expect(r.status).toBe('completed');expect(r.outputUrl).toBe('https://cdn/x.mp4');
  });
  it('COMPLETED with a volume-relative URL is flagged as failed with guidance',async()=>{
    status({id:'j',status:'COMPLETED',output:{outputUrl:'/outputs/x.mp4'}});
    const r=await getGeneration('j');expect(r.status).toBe('failed');expect(r.message).toMatch(/PUBLIC_OUTPUT_BASE_URL/);
  });
  it('worker-level failure inside COMPLETED is surfaced',async()=>{
    status({id:'j',status:'COMPLETED',output:{status:'failed',message:'CUDA OOM'}});
    const r=await getGeneration('j');expect(r.status).toBe('failed');expect(r.message).toBe('CUDA OOM');
  });
  it.each(['FAILED','CANCELLED','TIMED_OUT'])('%s → failed',async s=>{
    status({id:'j',status:s});expect((await getGeneration('j')).status).toBe('failed');
  });
  it('submits {action:"generate"} and {action:"render"} envelopes',async()=>{
    const f=vi.fn().mockImplementation(async()=>json({id:'j',status:'IN_QUEUE'}));vi.stubGlobal('fetch',f);
    await submitGeneration({provider:'ltx',prompt:'p',duration:5});
    expect(JSON.parse(f.mock.calls[0][1].body).input).toMatchObject({action:'generate',provider:'ltx'});
    await submitRender(['a']);
    expect(JSON.parse(f.mock.calls[1][1].body).input).toEqual({action:'render',clips:['a']});
  });
});
