'use client';
import {useEffect,useState} from 'react';
import {PRESETS,TRANSITIONS,GRADES,TRANSITION_LABELS,GRADE_LABELS,applyPreset,type FinishSettings,type PresetId} from '@/lib/video-tools';

type Tool={id:string;label:string;role:string;available:boolean};

function Toggle({on,onChange,label}:{on:boolean;onChange:(v:boolean)=>void;label:string}){
 return <button type="button" role="switch" aria-checked={on} onClick={()=>onChange(!on)} className="flex items-center gap-2 text-sm">
  <span className={'relative h-5 w-9 rounded-full transition '+(on?'bg-purple-500':'bg-white/15')}><span className={'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all '+(on?'start-[18px]':'start-0.5')}/></span>{label}
 </button>;
}

function Slider({label,value,min,max,step,onChange,format}:{label:string;value:number;min:number;max:number;step:number;onChange:(v:number)=>void;format?:(v:number)=>string}){
 return <label className="block text-xs text-slate-400"><span className="flex justify-between"><span>{label}</span><span className="text-slate-300">{format?format(value):value}</span></span>
  <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))} className="mt-2 w-full accent-purple-500"/></label>;
}

export default function CinematicFinishPanel({value,onChange,sceneCount,captionsAvailable}:{value:FinishSettings;onChange:(v:FinishSettings)=>void;sceneCount:number;captionsAvailable:number}){
 const[tools,setTools]=useState<Tool[]|null>(null),[open,setOpen]=useState(false);
 useEffect(()=>{fetch('/api/providers',{cache:'no-store'}).then(r=>r.json()).then(d=>setTools(d.finishing||[])).catch(()=>setTools([]))},[]);
 const set=<K extends keyof FinishSettings>(k:K,v:FinishSettings[K])=>onChange({...value,[k]:v});
 const pct=(v:number)=>Math.round(v*100)+'%';

 return <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div><p className="text-xs font-bold uppercase tracking-wider text-amber-300">المونتاج السينمائي</p><p className="text-xs text-slate-500">يُطبَّق عند دمج المشاهد · ويمكن إعادة تطبيقه بمظهر جديد دون إعادة التوليد</p></div>
   {tools&&tools.length>0&&<div className="flex flex-wrap gap-1.5">{tools.map(t=><span key={t.id} title={t.role} className={'rounded-full border px-2 py-0.5 text-[11px] '+(t.available?'border-emerald-500/40 text-emerald-300':'border-white/10 text-slate-500')}>{t.available?'●':'○'} {t.label}</span>)}</div>}
  </div>

  <div className="mt-4 grid gap-2 sm:grid-cols-3">
   {(Object.keys(PRESETS) as PresetId[]).map(id=><button type="button" key={id} onClick={()=>onChange(applyPreset(value,id))} className={'rounded-xl border p-3 text-left transition '+(value.preset===id?'border-amber-400/70 bg-amber-400/10':'border-white/10 hover:border-white/25')}>
    <b className="text-sm">{PRESETS[id].label}</b><p className="mt-1 text-[11px] leading-4 text-slate-400">{PRESETS[id].hint}</p></button>)}
  </div>

  <div className="mt-4 grid gap-4 md:grid-cols-2">
   <div className="space-y-3">
    <Toggle on={value.titleOn} onChange={v=>set('titleOn',v)} label="بطاقة عنوان افتتاحية"/>
    {value.titleOn&&<div className="grid gap-2"><input dir="auto" value={value.title} onChange={e=>set('title',e.target.value)} className="field !p-3 text-sm" placeholder="عنوان الفيلم"/><input dir="auto" value={value.titleSubtitle} onChange={e=>set('titleSubtitle',e.target.value)} className="field !p-3 text-sm" placeholder="عنوان فرعي (اختياري)"/></div>}
    <Toggle on={value.endOn} onChange={v=>set('endOn',v)} label="بطاقة ختامية"/>
    {value.endOn&&<div className="grid gap-2"><input dir="auto" value={value.endTitle} onChange={e=>set('endTitle',e.target.value)} className="field !p-3 text-sm" placeholder="رسالة الختام"/><input dir="auto" value={value.endSubtitle} onChange={e=>set('endSubtitle',e.target.value)} className="field !p-3 text-sm" placeholder="دعوة للمشاهد أو رابط"/></div>}
    <Toggle on={value.captionsOn} onChange={v=>set('captionsOn',v)} label={`ترجمة عربية مدمجة من نص المشاهد (${captionsAvailable}/${sceneCount})`}/>
   </div>
   <div className="space-y-3">
    <label className="block text-xs text-slate-400">موسيقى خلفية · رابط عام لملف MP3 أو WAV<input value={value.music} onChange={e=>set('music',e.target.value)} className="field ltr mt-1 !p-3 text-sm" placeholder="https://…/score.mp3" inputMode="url"/></label>
    {value.music.trim()&&<Slider label="مستوى الموسيقى" value={value.musicVolume} min={0} max={1} step={0.05} onChange={v=>set('musicVolume',v)} format={pct}/>}
    <label className="block text-xs text-slate-400">تعليق صوتي · رابط عام لملف صوتي (تنخفض الموسيقى تحته تلقائياً)<input value={value.voice} onChange={e=>set('voice',e.target.value)} className="field ltr mt-1 !p-3 text-sm" placeholder="https://…/voiceover.wav" inputMode="url"/></label>
   </div>
  </div>

  <button type="button" onClick={()=>setOpen(!open)} className="mt-4 text-xs text-purple-300">{open?'إخفاء':'إظهار'} الضبط الدقيق</button>
  {open&&<div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
   <label className="block text-xs text-slate-400">المقاس<select value={value.aspect} onChange={e=>set('aspect',e.target.value as FinishSettings['aspect'])} className="field mt-1 !p-2.5 text-sm"><option value="16:9">16:9 أفقي</option><option value="9:16">9:16 عمودي</option></select></label>
   <label className="block text-xs text-slate-400">الانتقال<select value={value.transition} onChange={e=>set('transition',e.target.value as FinishSettings['transition'])} className="field mt-1 !p-2.5 text-sm">{TRANSITIONS.map(t=><option key={t} value={t}>{TRANSITION_LABELS[t]}</option>)}</select></label>
   <label className="block text-xs text-slate-400">التلوين<select value={value.grade} onChange={e=>set('grade',e.target.value as FinishSettings['grade'])} className="field mt-1 !p-2.5 text-sm">{GRADES.map(g=><option key={g} value={g}>{GRADE_LABELS[g]}</option>)}</select></label>
   <Slider label="مدة الانتقال" value={value.transitionDuration} min={0.2} max={2} step={0.1} onChange={v=>set('transitionDuration',v)} format={v=>v.toFixed(1)+' ث'}/>
   <Slider label="تظليل الأطراف" value={value.vignette} min={0} max={1} step={0.05} onChange={v=>set('vignette',v)} format={pct}/>
   <Slider label="حبيبات الفيلم" value={value.grain} min={0} max={0.15} step={0.01} onChange={v=>set('grain',v)} format={v=>v.toFixed(2)}/>
   <Slider label="ظهور واختفاء تدريجي" value={value.fade} min={0} max={3} step={0.1} onChange={v=>set('fade',v)} format={v=>v.toFixed(1)+' ث'}/>
   <div className="flex items-end"><Toggle on={value.letterbox} onChange={v=>set('letterbox',v)} label="إطار سينمائي 2.39:1"/></div>
  </div>}
 </div>;
}
