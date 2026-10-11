'use client';
import {useEffect,useState} from 'react';
import type {Job} from '@/lib/types';
const clock=(n:number)=>`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
export default function ProductionProgress({job}:{job:Job}){
 const [now,setNow]=useState(Date.now());
 const active=job.status==='queued'||job.status==='processing';
 useEffect(()=>{if(!active)return;const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[active]);
 const elapsed=Math.max(0,Math.floor(((job.completedAt?Date.parse(job.completedAt):now)-Date.parse(job.submittedAt||job.createdAt))/1000));
 const known=job.progressPercent!==undefined||job.status==='completed';
 const percent=job.status==='completed'?100:Math.max(0,Math.min(99,Math.floor(job.progressPercent||0)));
 return <div className="mt-4 flex items-center gap-5 rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
 <div className="relative h-28 w-28 shrink-0" role="progressbar" aria-label="تقدم إنتاج الفيديو" aria-valuemin={0} aria-valuemax={100} aria-valuenow={known?percent:undefined} aria-valuetext={known?`${percent}%`:'انتظار بيانات التقدم من الخادم'}>
 <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true"><circle cx="50" cy="50" r="43" fill="none" stroke="#292339" strokeWidth="7"/><circle cx="50" cy="50" r="43" fill="none" stroke="#b18aff" strokeWidth="7" strokeLinecap="round" strokeDasharray="270.18" strokeDashoffset={270.18*(1-percent/100)} className="transition-all duration-700"/></svg>
 <div className="absolute inset-0 flex flex-col items-center justify-center"><b className="text-2xl">{known?`${percent}%`:'…'}</b><span className="text-xs text-slate-400">{clock(elapsed)}</span></div></div>
 <div><p className="font-bold">{job.status==='completed'?'اكتمل الفيديو':job.status==='failed'?'توقف الإنتاج':job.status==='cancelled'?'أُلغي الإنتاج':'إنتاج الفيديو'}</p><p className="mt-1 text-sm text-slate-300">{job.progress||'جارٍ الاتصال بالخادم'}</p><p className="mt-2 text-xs text-slate-400">الوقت المنقضي: {clock(elapsed)} · {active&&job.etaSeconds!==undefined?`المتبقي تقديريًا: ${clock(Math.ceil(job.etaSeconds))}`:'يُقدّر الوقت المتبقي بعد توفر قياس كافٍ.'}</p><p className="mt-1 text-xs text-slate-500">النسبة تعكس مراحل التنفيذ الفعلية؛ الزمن المتبقي تقدير يتغير بحسب سرعة الخادم.</p></div></div>;
}
