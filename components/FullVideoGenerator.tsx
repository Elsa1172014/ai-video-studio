'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {Scene} from '@/lib/project-store';

type Job={jobId?:string;status?:'queued'|'processing'|'completed'|'failed';outputUrl?:string;message?:string;error?:string};
type Clip={sceneId:string;title:string;url:string};
async function json(r:Response){const t=await r.text();try{return JSON.parse(t)}catch{return{status:'failed',error:t||('HTTP '+r.status)}}}
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));

export default function FullVideoGenerator({scenes}:{scenes:Scene[]}){
 const key=useMemo(()=>{let h=2166136261;for(const s of scenes){const x=s.id+'|'+s.prompt+'|'+s.duration;for(let i=0;i<x.length;i++){h^=x.charCodeAt(i);h=Math.imul(h,16777619)}}return 'ai-video-progress-'+(h>>>0).toString(16)},[scenes]);
 const[running,setRunning]=useState(false),[index,setIndex]=useState(-1),[clips,setClips]=useState<Clip[]>([]),[error,setError]=useState(''),[finalUrl,setFinalUrl]=useState('');
 const stop=useRef(false);
 useEffect(()=>{stop.current=false;try{const saved=JSON.parse(localStorage.getItem(key)||'{}');if(Array.isArray(saved.clips))setClips(saved.clips);if(saved.finalUrl)setFinalUrl(saved.finalUrl)}catch{}return()=>{stop.current=true}},[key]);
 function persist(next:Clip[],final=''){localStorage.setItem(key,JSON.stringify({clips:next,finalUrl:final,updatedAt:new Date().toISOString()}))}
 async function complete(job:Job):Promise<Job>{let current=job;while(!stop.current&&current.jobId&&(current.status==='queued'||current.status==='processing')){await wait(3000);current=await json(await fetch('/api/jobs/'+encodeURIComponent(current.jobId),{cache:'no-store'}))}return current}
 async function render(made:Clip[]){setIndex(scenes.length);const rr=await fetch('/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clips:made.map(x=>x.url)})});const out=await json(rr);if(!rr.ok||out.status!=='completed'||!out.outputUrl)throw new Error(out.message||out.error||'Final render failed');setFinalUrl(out.outputUrl);persist(made,out.outputUrl)}
 async function run(){
  stop.current=false;setRunning(true);setError('');setFinalUrl('');
  const made=[...clips].filter(c=>scenes.some(s=>s.id===c.sceneId));persist(made);
  try{
   for(let i=0;i<scenes.length;i++){
    const scene=scenes[i];if(made.some(c=>c.sceneId===scene.id)){setIndex(i);continue}
    setIndex(i);const r=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'ltx',prompt:scene.prompt,duration:scene.duration})});
    let job:Job=await json(r);if(!r.ok)throw new Error(job.error||job.message||'Generation request failed');job=await complete(job);
    if(job.status!=='completed'||!job.outputUrl)throw new Error(job.error||job.message||('Scene '+(i+1)+' failed'));
    made.push({sceneId:scene.id,title:scene.title,url:job.outputUrl});setClips([...made]);persist(made);
   }
   await render(made);
  }catch(e){setError(e instanceof Error?e.message:'Full video generation failed')}finally{setRunning(false)}
 }
 async function joinOnly(){setRunning(true);setError('');try{await render(clips)}catch(e){setError(e instanceof Error?e.message:'Final render failed')}finally{setRunning(false)}}
 function reset(){if(running)return;localStorage.removeItem(key);setClips([]);setFinalUrl('');setError('');setIndex(-1)}
 const filename=finalUrl?.split('/').pop(),videoSrc=filename?'/api/video/'+encodeURIComponent(filename):undefined,completeCount=clips.length;
 return <div className="card mt-5 p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs text-purple-400">FULL STORY PRODUCTION</p><h2 className="font-bold">Generate full video</h2><p className="mt-1 text-xs text-slate-400">{scenes.length} connected scenes · {scenes.reduce((n,s)=>n+s.duration,0)} sec total · {completeCount}/{scenes.length} saved</p></div><div className="flex gap-2"><button onClick={run} disabled={running||!scenes.length} className="btn primary disabled:opacity-40">{running?'Producing…':completeCount?'Resume Full Video':'Generate Full Video'}</button>{completeCount===scenes.length&&!finalUrl&&<button onClick={joinOnly} disabled={running} className="btn ghost">Join saved scenes</button>}</div></div>{running&&<div className="mt-4"><div className="flex justify-between text-sm"><span>{index<scenes.length?'Processing scene '+(index+1)+' of '+scenes.length:'Joining saved scenes…'}</span><span>{Math.round(completeCount/Math.max(1,scenes.length)*100)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded bg-white/10"><div className="h-full bg-purple-500 transition-all" style={{width:(completeCount/Math.max(1,scenes.length)*100)+'%'}}/></div></div>}{completeCount>0&&<div className="mt-3 flex items-center justify-between"><p className="text-xs text-slate-400">{completeCount} completed scene clips are saved. Interrupted jobs will resume without regenerating them.</p><button onClick={reset} disabled={running} className="text-xs text-slate-500 hover:text-white">Reset progress</button></div>}{error&&<div className="mt-4 rounded-xl border border-red-500/30 p-3 text-sm text-red-300">{error}</div>}{videoSrc&&<div className="mt-4"><p className="mb-2 font-semibold">Final video</p><video className="w-full rounded-xl" controls preload="metadata" src={videoSrc}/><a className="btn ghost mt-3 inline-block" href={videoSrc} target="_blank" rel="noreferrer">Open final MP4 ↗</a></div>}</div>
}
