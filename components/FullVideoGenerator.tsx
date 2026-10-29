'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {Scene} from '@/lib/project-store';
import CinematicFinishPanel from '@/components/CinematicFinishPanel';
import {buildFinish,defaultFinish,type FinishSettings} from '@/lib/video-tools';

type Report={steps:string[];warnings:string[];duration:number;size:string};
type Job={jobId?:string;status?:'queued'|'processing'|'completed'|'failed';outputUrl?:string;captionsUrl?:string|null;report?:Report;message?:string;error?:string};
type Clip={sceneId:string;title:string;url:string};
async function json(r:Response){const t=await r.text();try{return JSON.parse(t)}catch{return{status:'failed',error:t||('HTTP '+r.status)}}}
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const proxied=(url?:string|null)=>{const name=url?.split('?')[0].split('/').pop();return name?'/api/video/'+encodeURIComponent(name):undefined};
const STEP_LABELS:Record<string,string>={'title-card':'Title card','end-card':'Closing card',letterbox:'Letterbox',vignette:'Vignette','film-grain':'Film grain',captions:'Arabic captions',fade:'Fades',music:'Music',voice:'Narration','music-ducked':'Music ducked under voice'};
const label=(step:string)=>STEP_LABELS[step]||step.replace(/^(\w+):/,(_,k)=>({transition:'Transition: ',grade:'Grade: ',normalize:'Clips normalised: '} as Record<string,string>)[k]||k+': ');

export default function FullVideoGenerator({scenes,characterImageUrl,title=''}:{scenes:Scene[];characterImageUrl?:string;title?:string}){
 const key=useMemo(()=>{let h=2166136261;for(const s of scenes){const x=s.id+'|'+s.prompt+'|'+s.duration;for(let i=0;i<x.length;i++){h^=x.charCodeAt(i);h=Math.imul(h,16777619)}}return 'ai-video-progress-'+(h>>>0).toString(16)},[scenes]);
 const[running,setRunning]=useState(false),[index,setIndex]=useState(-1),[clips,setClips]=useState<Clip[]>([]),[error,setError]=useState(''),[finalUrl,setFinalUrl]=useState(''),[captionsUrl,setCaptionsUrl]=useState(''),[report,setReport]=useState<Report|null>(null);
 const[finish,setFinish]=useState<FinishSettings>(()=>defaultFinish(title));
 const stop=useRef(false);

 useEffect(()=>{stop.current=false;setClips([]);setFinalUrl('');setCaptionsUrl('');setReport(null);setError('');try{const saved=JSON.parse(localStorage.getItem(key)||'{}');if(Array.isArray(saved.clips))setClips(saved.clips);if(saved.finalUrl)setFinalUrl(saved.finalUrl);if(saved.captionsUrl)setCaptionsUrl(saved.captionsUrl);if(saved.report)setReport(saved.report);setFinish(saved.finish?{...defaultFinish(title),...saved.finish}:defaultFinish(title))}catch{setFinish(defaultFinish(title))}return()=>{stop.current=true}},[key,title]);
 function persist(next:Clip[],final='',extra:{captionsUrl?:string;report?:Report|null}={},look:FinishSettings=finish){try{localStorage.setItem(key,JSON.stringify({clips:next,finalUrl:final,captionsUrl:extra.captionsUrl||'',report:extra.report||null,finish:look,updatedAt:new Date().toISOString()}))}catch{}}
 function updateFinish(next:FinishSettings){setFinish(next);persist(clips,finalUrl,{captionsUrl,report},next)}

 async function complete(job:Job):Promise<Job>{let current=job;while(!stop.current&&current.jobId&&(current.status==='queued'||current.status==='processing')){await wait(3000);current=await json(await fetch('/api/jobs/'+encodeURIComponent(current.jobId),{cache:'no-store'}))}return current}

 async function render(made:Clip[]){
  setIndex(scenes.length);setReport(null);
  // Join in storyboard order so captions line up with their scenes.
  const ordered=scenes.map(s=>made.find(c=>c.sceneId===s.id)).filter((c):c is Clip=>Boolean(c));
  const sceneTexts=ordered.map(c=>scenes.find(s=>s.id===c.sceneId)?.sourceText);
  let payload;
  try{payload=buildFinish(finish,sceneTexts)}catch{throw new Error('Check the finishing settings: music and narration must be public http(s) links.')}
  const rr=await fetch('/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clips:ordered.map(x=>x.url),...(payload?{finish:payload}:{})})});
  let out:Job=await json(rr);if(!rr.ok)throw new Error(out.message||out.error||'Final render failed');
  out=await complete(out);
  if(out.status!=='completed'||!out.outputUrl)throw new Error(out.message||out.error||'Final render failed');
  setFinalUrl(out.outputUrl);setCaptionsUrl(out.captionsUrl||'');setReport(out.report||null);
  persist(made,out.outputUrl,{captionsUrl:out.captionsUrl||'',report:out.report||null});
 }

 async function run(){
  stop.current=false;setRunning(true);setError('');setFinalUrl('');setCaptionsUrl('');
  const made=[...clips].filter(c=>scenes.some(s=>s.id===c.sceneId));persist(made);
  try{
   for(let i=0;i<scenes.length;i++){
    const scene=scenes[i];if(made.some(c=>c.sceneId===scene.id)){setIndex(i);continue}
    setIndex(i);const r=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'ltx',prompt:scene.prompt,duration:scene.duration,...(characterImageUrl?{imageUrl:characterImageUrl}:{})})});
    let job:Job=await json(r);if(!r.ok)throw new Error(job.error||job.message||'Generation request failed');job=await complete(job);
    if(job.status!=='completed'||!job.outputUrl)throw new Error(job.error||job.message||('Scene '+(i+1)+' failed'));
    made.push({sceneId:scene.id,title:scene.title,url:job.outputUrl});setClips([...made]);persist(made);
   }
   await render(made);
  }catch(e){setError(e instanceof Error?e.message:'Full video generation failed')}finally{setRunning(false)}
 }
 async function finishOnly(){setRunning(true);setError('');try{await render(clips)}catch(e){setError(e instanceof Error?e.message:'Final render failed')}finally{setRunning(false)}}
 function reset(){if(running)return;try{localStorage.removeItem(key)}catch{};setClips([]);setFinalUrl('');setCaptionsUrl('');setReport(null);setError('');setIndex(-1)}

 const videoSrc=proxied(finalUrl),srtSrc=proxied(captionsUrl),completeCount=clips.filter(c=>scenes.some(s=>s.id===c.sceneId)).length,allDone=scenes.length>0&&completeCount===scenes.length;
 const captionsAvailable=scenes.filter(s=>s.sourceText?.trim()).length;
 return <div className="card mt-5 p-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-purple-400">FULL STORY PRODUCTION</p><h2 className="font-bold">Generate full video</h2><p className="mt-1 text-xs text-slate-400">{scenes.length} connected scenes · {scenes.reduce((n,s)=>n+s.duration,0)} sec total · {completeCount}/{scenes.length} saved</p></div>
   <div className="flex flex-wrap gap-2"><button onClick={run} disabled={running||!scenes.length} className="btn primary disabled:opacity-40">{running?'Producing…':allDone?'Regenerate missing & finish':completeCount?'Resume Full Video':'Generate Full Video'}</button>{allDone&&<button onClick={finishOnly} disabled={running} className="btn ghost disabled:opacity-40">{finalUrl?'Re-apply cinematic finish':'Finish saved scenes'}</button>}</div></div>
  <CinematicFinishPanel value={finish} onChange={updateFinish} sceneCount={scenes.length} captionsAvailable={captionsAvailable}/>
  {running&&<div className="mt-4"><div className="flex justify-between text-sm"><span>{index<scenes.length?'Processing scene '+(index+1)+' of '+scenes.length:'Cinematic finishing: transitions, grade, captions, sound…'}</span><span>{Math.round(completeCount/Math.max(1,scenes.length)*100)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded bg-white/10"><div className={'h-full bg-purple-500 transition-all '+(index>=scenes.length?'animate-pulse':'')} style={{width:(completeCount/Math.max(1,scenes.length)*100)+'%'}}/></div></div>}
  {completeCount>0&&<div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-slate-400">{completeCount} completed scene clips are saved. Interrupted jobs resume without regenerating them, and the finish can be re-applied with a new look.</p><button onClick={reset} disabled={running} className="shrink-0 text-xs text-slate-500 hover:text-white">Reset progress</button></div>}
  {error&&<div className="mt-4 rounded-xl border border-red-500/30 p-3 text-sm text-red-300">{error}</div>}
  {videoSrc&&<div className="mt-4"><p className="mb-2 font-semibold">Final film</p><video className="w-full rounded-xl bg-black" controls preload="metadata" src={videoSrc}/>
   {report&&<div className="mt-3 flex flex-wrap gap-1.5">{report.steps.map(s=><span key={s} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-300">{label(s)}</span>)}<span className="rounded-full px-2 py-0.5 text-[11px] text-slate-500">{report.size} · {report.duration}s</span></div>}
   <div className="mt-3 flex flex-wrap gap-2"><a className="btn ghost inline-block" href={videoSrc} target="_blank" rel="noreferrer">Open final MP4 ↗</a>{srtSrc&&<a className="btn ghost inline-block" href={srtSrc} download>Download captions (.srt)</a>}</div></div>}
 </div>;
}
