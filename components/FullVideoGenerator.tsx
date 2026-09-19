'use client';
import {useEffect,useRef,useState} from 'react';
import type {Scene} from '@/lib/project-store';

type Job={jobId?:string;status?:'queued'|'processing'|'completed'|'failed';outputUrl?:string;message?:string;error?:string};
type Clip={sceneId:string;title:string;url:string};

async function json(r:Response){const t=await r.text();try{return JSON.parse(t)}catch{return{status:'failed',error:t||('HTTP '+r.status)}}}
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));

export default function FullVideoGenerator({scenes}:{scenes:Scene[]}){
 const[running,setRunning]=useState(false);const[index,setIndex]=useState(-1);const[clips,setClips]=useState<Clip[]>([]);const[error,setError]=useState('');const[finalUrl,setFinalUrl]=useState('');
 const stop=useRef(false);useEffect(()=>()=>{stop.current=true},[]);

 async function complete(job:Job):Promise<Job>{
  let current=job;
  while(!stop.current&&current.jobId&&(current.status==='queued'||current.status==='processing')){
   await wait(3000);const r=await fetch('/api/jobs/'+encodeURIComponent(current.jobId),{cache:'no-store'});current=await json(r);
  }
  return current;
 }

 async function run(){
  stop.current=false;setRunning(true);setError('');setFinalUrl('');setClips([]);
  const made:Clip[]=[];
  try{
   for(let i=0;i<scenes.length;i++){
    setIndex(i);const scene=scenes[i];
    const r=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'ltx',prompt:scene.prompt,duration:scene.duration})});
    let job:Job=await json(r);if(!r.ok)throw new Error(job.error||job.message||'Generation request failed');
    job=await complete(job);if(job.status!=='completed'||!job.outputUrl)throw new Error(job.error||job.message||('Scene '+(i+1)+' failed'));
    const clip={sceneId:scene.id,title:scene.title,url:job.outputUrl};made.push(clip);setClips([...made]);
   }
   setIndex(scenes.length);
   const rr=await fetch('/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clips:made.map(x=>x.url)})});
   const rendered=await json(rr);if(!rr.ok||rendered.status!=='completed'||!rendered.outputUrl)throw new Error(rendered.message||rendered.error||'Final render failed');
   setFinalUrl(rendered.outputUrl);
  }catch(e){setError(e instanceof Error?e.message:'Full video generation failed')}
  finally{setRunning(false)}
 }
 const filename=finalUrl?.split('/').pop();const videoSrc=filename?'/api/video/'+encodeURIComponent(filename):undefined;
 return <div className="card mt-5 p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs text-purple-400">FULL STORY PRODUCTION</p><h2 className="font-bold">Generate full video</h2><p className="mt-1 text-xs text-slate-400">{scenes.length} connected scenes · {scenes.reduce((n,s)=>n+s.duration,0)} sec total</p></div><button onClick={run} disabled={running||!scenes.length} className="btn primary disabled:opacity-40">{running?'Producing…':'Generate Full Video'}</button></div>{running&&<div className="mt-4"><div className="flex justify-between text-sm"><span>{index<scenes.length?'Generating scene '+(index+1)+' of '+scenes.length:'Joining scenes…'}</span><span>{Math.round((Math.max(0,index)+(index>=scenes.length?1:0))/Math.max(1,scenes.length+1)*100)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded bg-white/10"><div className="h-full bg-purple-500 transition-all" style={{width:(Math.max(0,index)/Math.max(1,scenes.length)*100)+'%'}}/></div></div>}{clips.length>0&&<p className="mt-3 text-xs text-slate-400">{clips.length} scene clips completed.</p>}{error&&<div className="mt-4 rounded-xl border border-red-500/30 p-3 text-sm text-red-300">{error}</div>}{videoSrc&&<div className="mt-4"><p className="mb-2 font-semibold">Final video</p><video className="w-full rounded-xl" controls preload="metadata" src={videoSrc}/><a className="btn ghost mt-3 inline-block" href={videoSrc} target="_blank" rel="noreferrer">Open final MP4 ↗</a></div>}</div>
}
