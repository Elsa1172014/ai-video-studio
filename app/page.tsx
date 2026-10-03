'use client';
import {useState} from 'react';
import Link from 'next/link';
import {saveProject,VideoProject,Character} from '@/lib/project-store';
import GenerationPanel from '@/components/GenerationPanel';
import SystemStatus from '@/components/SystemStatus';
import FullVideoGenerator from '@/components/FullVideoGenerator';

type Mode='education'|'series';
export default function Home(){
 const[mode,setMode]=useState<Mode>('education'),[prompt,setPrompt]=useState(''),[minutes,setMinutes]=useState(1),[episodeTitle,setEpisodeTitle]=useState(''),[castText,setCastText]=useState('');
 const[plan,setPlan]=useState<VideoProject|null>(null),[busy,setBusy]=useState(false),[selected,setSelected]=useState(0),[error,setError]=useState('');
 const characters:Character[]=castText.split('\n').map(x=>x.trim()).filter(Boolean).map(line=>{const [name,...rest]=line.split(':');return{name:name.trim(),description:rest.join(':').trim()||'Keep appearance and identity consistent'}});

 async function generate(){
  if(!prompt.trim())return;setBusy(true);setError('');
  try{const r=await fetch('/api/script',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,minutes,mode,episodeTitle,characters})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Planning failed');setPlan(data);setSelected(0);saveProject(data)}
  catch(e){setError(e instanceof Error?e.message:'Planning failed')}finally{setBusy(false)}
 }
 const scene=plan?.scenes?.[selected];
 return <main className="min-h-screen">
  <header className="border-b border-white/10 px-6 py-4"><b className="text-xl">AI Video Studio</b><span className="ml-3 text-sm text-purple-400">Two production engines</span><div className="float-right flex items-center gap-5"><SystemStatus/><Link href="/studio" className="text-sm text-purple-300">Production Studio</Link><Link href="/projects" className="text-sm text-slate-300">My Projects →</Link></div></header>
  <div className="mx-auto max-w-7xl p-6">
   <section className="mb-6 grid gap-4 md:grid-cols-2">
    <button onClick={()=>{setMode('education');setPlan(null)}} className={'mode-card '+(mode==='education'?'mode-active':'')}><span className="mode-icon">EDU</span><div><p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Educational Studio</p><h2 className="mt-1 text-2xl font-bold">Turn lesson text into a visual explanation</h2><p className="mt-2 text-sm text-slate-400">Keeps your teaching content intact, identifies learning beats, and designs the scenes automatically.</p></div></button>
    <button onClick={()=>{setMode('series');setPlan(null)}} className={'mode-card '+(mode==='series'?'mode-active':'')}><span className="mode-icon">SER</span><div><p className="text-xs font-bold uppercase tracking-widest text-purple-300">Series Studio</p><h2 className="mt-1 text-2xl font-bold">Build episodes with persistent characters</h2><p className="mt-2 text-sm text-slate-400">Plans cinematic episodes while preserving character identity, story continuity and visual language.</p></div></button>
   </section>
   <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
    <section>
     <div className="card p-6"><p className="text-sm font-bold text-purple-400">{mode==='education'?'EDUCATIONAL DIRECTOR':'EPISODE DIRECTOR'}</p><h1 className="mt-2 text-3xl font-bold">{mode==='education'?'Paste the lesson. The studio builds the visual teaching flow.':'Write the episode. The studio protects continuity.'}</h1>
      {mode==='series'&&<input value={episodeTitle} onChange={e=>setEpisodeTitle(e.target.value)} className="field mt-5" placeholder="Episode title (e.g. Episode 01 — The Discovery)"/>}
      <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} className="field mt-4 min-h-48" placeholder={mode==='education'?'Paste the complete educational text here. The facts and meaning will be preserved.':'Paste your script or describe the episode story. The director will build connected scenes.'}/>
      {mode==='series'&&<><label className="mt-4 block text-xs font-bold uppercase tracking-wider text-slate-500">Character Bible · one character per line</label><textarea value={castText} onChange={e=>setCastText(e.target.value)} className="field mt-2 min-h-28" placeholder={'Omar: 12-year-old Emirati boy, white kandura, curious, warm voice\nMariam: 11-year-old Emirati girl, navy abaya, confident, calm voice'}/></>}
      <div className="mt-4 flex flex-wrap gap-3"><select value={minutes} onChange={e=>setMinutes(Number(e.target.value))} className="ghost btn"><option value={0.5}>30 seconds</option><option value={1}>1 minute</option><option value={2}>2 minutes</option><option value={5}>5 minutes</option><option value={10}>10 minutes</option><option value={20}>20 minutes</option></select><button onClick={generate} disabled={busy||!prompt.trim()} className="btn primary disabled:opacity-40">{busy?'Directing…':mode==='education'?'Build educational storyboard':'Build episode storyboard'}</button></div>{error&&<p className="mt-3 text-sm text-red-300">{error}</p>}
     </div>
     {plan&&<><div className="card mt-5 p-5"><div className="flex items-center justify-between gap-4"><div><p className="text-xs text-purple-400">{plan.mode==='series'?'EPISODE STORYBOARD':'LEARNING STORYBOARD'}</p><h2 className="text-xl font-bold">{plan.title}</h2></div><span className="text-xs text-slate-500">{plan.scenes.length} scenes · {plan.scenes.reduce((n,s)=>n+s.duration,0)} sec</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{plan.scenes.map((s,i)=><button onClick={()=>setSelected(i)} key={s.id} className={'rounded-xl border p-4 text-left '+(selected===i?'border-purple-500 bg-purple-500/10':'border-white/10')}><b>{s.title}</b><p className="mt-1 text-xs text-slate-500">{s.duration}s · {s.status}</p><p className="mt-2 line-clamp-2 text-xs text-slate-400">{s.sourceText}</p></button>)}</div></div><GenerationPanel prompt={scene?.prompt??plan.prompt} duration={scene?.duration??5}/><FullVideoGenerator scenes={plan.scenes}/></>}
    </section>
    <aside className="space-y-4"><div className="card p-5"><h3 className="font-bold">{mode==='education'?'Educational rules':'Continuity engine'}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{mode==='education'?'Source-first: the system visualizes your lesson without rewriting its facts. Scene duration follows the teaching beat rather than a fixed clip length.':'Character Bible is injected into every scene prompt so identity, appearance and story logic remain stable across the episode.'}</p></div><div className="card p-5"><h3 className="font-bold">Production engine</h3><p className="mt-3 text-sm leading-6 text-slate-400">Storyboard → LTX scene generation → saved clips → final MP4. Completed clips are retained so interrupted productions can resume.</p><Link href="/studio" className="btn primary mt-4 block text-center">Open Production Studio</Link></div></aside>
   </div>
  </div>
 </main>
}
