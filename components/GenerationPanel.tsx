'use client';
import {useEffect,useRef,useState} from 'react';

type Job={
  jobId?:string;
  status?:'queued'|'processing'|'completed'|'failed';
  provider?:string;
  outputUrl?:string;
  message?:string;
  error?:string;
};

async function readJob(r:Response):Promise<Job>{
  const text=await r.text();
  try{return JSON.parse(text) as Job;}
  catch{return{status:'failed',error:`Server returned ${r.status}: ${text.slice(0,240)||'empty response'}`};}
}

export default function GenerationPanel({prompt}:{prompt:string}){
  const [provider,setProvider]=useState('ltx');
  const [duration,setDuration]=useState(3);
  const [job,setJob]=useState<Job|null>(null);
  const [busy,setBusy]=useState(false);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);

  async function poll(id:string){
    try{
      const r=await fetch('/api/jobs/'+encodeURIComponent(id),{cache:'no-store'});
      const data=await readJob(r);
      setJob(data);
      if(r.ok&&(data.status==='queued'||data.status==='processing')){
        timer.current=setTimeout(()=>poll(id),3000);
      }else{
        setBusy(false);
      }
    }catch(e){
      setJob({status:'failed',error:e instanceof Error?e.message:'Status check failed'});
      setBusy(false);
    }
  }

  async function run(){
    if(timer.current)clearTimeout(timer.current);
    setBusy(true);
    setJob(null);
    try{
      const r=await fetch('/api/generate',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({provider,prompt,duration})
      });
      const data=await readJob(r);
      setJob(data);
      if(!r.ok||data.error||data.status==='failed'||data.status==='completed'){
        setBusy(false);
        return;
      }
      if(data.jobId)poll(data.jobId);
      else setBusy(false);
    }catch(e){
      setJob({status:'failed',error:e instanceof Error?e.message:'Generation failed'});
      setBusy(false);
    }
  }

  const label=job?.status==='processing'
    ?'Generating video…'
    :job?.status==='queued'
      ?'Waiting for GPU…'
      :busy?'Submitting…':'Generate video clip';

  const filename=job?.outputUrl?.split('/').pop();
  const videoSrc=filename?'/api/video/'+encodeURIComponent(filename):undefined;

  return (
    <div className="card mt-5 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-purple-400">GENERATION ENGINE</p>
          <h2 className="font-bold">Generate selected scene</h2>
        </div>
        <div className="flex gap-2">
          <select value={duration} onChange={e=>setDuration(Number(e.target.value))} className="ghost rounded-xl p-3">
            <option value={3}>3 sec</option><option value={5}>5 sec</option><option value={8}>8 sec</option>
          </select>
          <select value={provider} onChange={e=>setProvider(e.target.value)} className="ghost rounded-xl p-3">
            <option value="ltx">LTX Video</option><option value="wan">Wan 2.2</option>
          </select>
        </div>
      </div>
      <button onClick={run} disabled={busy||!prompt} className="btn primary mt-4 w-full disabled:opacity-40">{label}</button>
      {job&&(
        <div className="mt-4 rounded-xl border border-white/10 p-3 text-sm">
          <div className="flex items-center justify-between">
            <b>Status: {job.status||'error'}</b>
            {job.provider&&<span className="text-xs text-slate-500">{job.provider}</span>}
          </div>
          <p className="mt-1 text-slate-400">{job.message||job.error||job.jobId}</p>
          {(job.status==='queued'||job.status==='processing')&&(
            <div className="mt-3 h-1 overflow-hidden rounded bg-white/10">
              <div className="h-full w-2/3 animate-pulse bg-purple-500"/>
            </div>
          )}
          {job.outputUrl&&videoSrc&&(
            <>
              <video className="mt-3 w-full rounded-xl" controls preload="metadata" src={videoSrc}/>
              <a className="btn ghost mt-3 inline-block" href={videoSrc} target="_blank" rel="noreferrer">Open MP4 ↗</a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
