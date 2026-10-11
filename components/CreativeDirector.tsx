'use client';
import {useState} from 'react';
import type {FilmDirection,FilmBeat} from '@/lib/creative';
import {allocateSeconds,wordCount} from '@/lib/creative';
import {api,downscaleImage,errorText} from '@/lib/client';
import type {Character,MediaRef} from '@/lib/types';
export default function CreativeDirector({value,onChange,seconds}:{value:FilmDirection;onChange:(v:FilmDirection)=>void;seconds:number}){
 const [busy,setBusy]=useState(''),[error,setError]=useState('');
 const update=(p:Partial<FilmDirection>)=>onChange({...value,...p});
 const beat=(id:string,p:Partial<FilmBeat>)=>update({beats:value.beats.map(b=>b.id===id?{...b,...p}:b)});
 const character=(id:string,p:Partial<Character>)=>update({characters:value.characters.map(c=>c.id===id?{...c,...p}:c)});
 const total=value.beats.reduce((n,b)=>n+b.duration,0);
 async function upload(file:File,id?:string){setBusy(id||'music');setError('');try{const form=new FormData();form.append('file',id?await downscaleImage(file):file,id?'reference.jpg':file.name);const ref=await api<MediaRef>(id?'/api/media':'/api/music',{method:'POST',body:form});if(id)character(id,{referenceImage:ref});else update({music:'upload',musicUrl:ref.url});}catch(e){setError(errorText(e));}finally{setBusy('');}}
 return <section className="mt-5 rounded-2xl border border-purple-500/30 p-4" aria-label="غرفة الإخراج">
 <h2 className="text-xl font-bold">غرفة الإخراج — أنت تختار وتعدّل</h2>
 <p className="my-2 text-xs text-slate-400">المقترح الأولي مبني على فقرات النص. راجع الفكرة والدليل والتعليق لكل مشهد؛ لا تُحذف فقرة لمجرد ضيق الوقت.</p>
 <div className="grid gap-3 md:grid-cols-3">{([['explainer','شرح بصري','صور ورسوم وأدلة متتابعة'],['story','قصة سينمائية','بطل وموقف وتحول ونتيجة'],['dialogue','حوار وتمثيل','متحدثون بأصوات مختلفة']] as const).map(([format,title,desc])=><button type="button" key={format} aria-pressed={value.format===format} className={'rounded-xl border p-3 text-right '+(value.format===format?'border-purple-400 bg-purple-500/15':'border-white/10')} onClick={()=>update({format})}><b>{title}</b><p className="mt-1 text-xs">{desc}</p></button>)}</div>
 <p className="mt-3 text-sm">مدة قراءة النص كاملًا تقريبًا: {Math.ceil(value.beats.reduce((n,b)=>n+wordCount(b.sourceText),0)/1.8)} ثانية. المدة التي اخترتها: {seconds} ثانية.</p>
 <div className="mt-3 grid gap-3 md:grid-cols-2">
 <label>طريقة الإنتاج<select className="field" value={value.method} onChange={e=>update({method:e.target.value as FilmDirection['method']})}><option value="motion">سريع — لوحات توضيحية وصور بحركة وصوت</option><option value="cinematic">سينمائي مولّد — أبطأ بكثير على الخادم الحالي</option></select></label>
 <label>الهوية البصرية<input className="field" value={value.style} onChange={e=>update({style:e.target.value})}/></label>
 </div>
 <label className="mt-3 block">فكرة العرض وتعليمات التنفيذ<textarea className="field" value={value.execution} onChange={e=>update({execution:e.target.value})}/></label>
 <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn ghost" onClick={()=>{try{const d=allocateSeconds(value.beats.map(b=>Math.max(1,wordCount(b.narration))),seconds);update({beats:value.beats.map((b,i)=>({...b,duration:d[i]}))});setError('');}catch(e){setError(errorText(e));}}}>توزيع الوقت على الأفكار</button>
 <button type="button" className="btn primary" disabled={!!busy} onClick={async()=>{setBusy('ai');setError('');try{update(await api<FilmDirection>('/api/creative',{method:'POST',json:{direction:value,seconds}}));}catch(e){setError(errorText(e));}finally{setBusy('');}}}>{busy==='ai'?'جارٍ تلخيص الأفكار والأدلة…':'اقتراح اختصار ذكي يحفظ المعنى'}</button></div>
 <p className={'mt-2 text-xs '+(total===seconds?'text-emerald-300':'text-amber-300')}>مجموع المشاهد: {total} / {seconds} ثانية</p>
 <details className="mt-4 rounded-xl border border-white/10 p-3"><summary className="cursor-pointer font-bold">الشخصيات والصور والمتحدثون ({value.characters.length})</summary>
 {value.characters.map(c=><div key={c.id} className="my-3 rounded-xl bg-white/5 p-3"><div className="grid gap-2 md:grid-cols-3"><label>اسم الشخصية<input className="field" value={c.name} onChange={e=>character(c.id,{name:e.target.value})}/></label><label>الدور<select className="field" value={c.role||'رئيسة'} onChange={e=>character(c.id,{role:e.target.value})}><option>رئيسة</option><option>ثانوية</option><option>داعمة</option><option>راوٍ</option></select></label><label>الصوت<select className="field" value={c.voice?.voiceId||'ar-AE-HamdanNeural'} onChange={e=>character(c.id,{voice:{provider:'tts',voiceId:e.target.value}})}><option value="ar-AE-HamdanNeural">حمدان — إماراتي</option><option value="ar-AE-FatimaNeural">فاطمة — إماراتية</option><option value="ar-EG-ShakirNeural">شاكر — مصري</option><option value="ar-EG-SalmaNeural">سلمى — مصرية</option></select></label></div>
 <label>الملامح والملابس والشخصية<input className="field mt-2" value={c.appearance} onChange={e=>character(c.id,{appearance:e.target.value})}/></label>
 <label className="mt-2 block text-sm">صورة الشخصية<input className="block" type="file" accept="image/png,image/jpeg,image/webp" disabled={!!busy} onChange={e=>{const f=e.target.files?.[0];if(f)upload(f,c.id);}}/></label>
 {c.referenceImage&&<img src={c.referenceImage.url} alt={'مرجع '+c.name} className="mt-2 h-24 rounded-lg"/>}
 <button type="button" className="mt-2 text-xs text-red-300" onClick={()=>update({characters:value.characters.filter(x=>x.id!==c.id),beats:value.beats.map(b=>({...b,characterIds:b.characterIds.filter(id=>id!==c.id),speakerId:b.speakerId===c.id?undefined:b.speakerId}))})}>إزالة من المقترح</button></div>)}
 <button type="button" className="btn ghost mt-2" disabled={value.characters.length>=12} onClick={()=>update({characters:[...value.characters,{id:crypto.randomUUID(),seriesId:'education',name:'شخصية جديدة',role:'رئيسة',appearance:'ملامح وملابس ثابتة',voice:{provider:'tts',voiceId:'ar-AE-HamdanNeural'},locked:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}]})}>+ إضافة شخصية</button>
 <p className="mt-2 text-xs text-slate-400">المسار السريع يعرض الصور المرفوعة. التوليد السينمائي يستخدم صورة مرجعية رئيسة ووصف الشخصيات؛ لا يضمن التطابق التام لكل الوجوه.</p></details>
 <div className="mt-4 grid gap-3 md:grid-cols-2"><label>الموسيقى التصويرية<select className="field" value={value.music} onChange={e=>update({music:e.target.value as FilmDirection['music']})}><option value="none">بلا موسيقى</option><option value="ambient">خلفية موسيقية هادئة مولّدة</option><option value="cinematic">خلفية سينمائية مولّدة</option><option value="upload">ملف موسيقي أرفعه</option></select></label><label>مستوى الموسيقى تحت الكلام: {Math.round(value.musicVolume*100)}%<input className="block w-full mt-3" type="range" min="0" max="0.5" step="0.01" value={value.musicVolume} onChange={e=>update({musicVolume:Number(e.target.value)})}/></label></div>
 {value.music==='upload'&&<label className="block mt-2">ملف موسيقى MP3 أو WAV حتى 4 ميجابايت<input type="file" accept="audio/mpeg,audio/wav" disabled={!!busy} onChange={e=>{const f=e.target.files?.[0];if(f)upload(f);}}/>{value.musicUrl&&<audio controls src={value.musicUrl}/>}</label>}
 <div className="mt-4 space-y-3">{value.beats.map((b,i)=><details key={b.id} className="rounded-xl border border-white/10 p-3"><summary className="cursor-pointer">المشهد {i+1} · {b.duration} ث · {b.idea.slice(0,75)}</summary><p className="mt-2 whitespace-pre-wrap text-xs text-slate-400">الفقرة الأصلية: {b.sourceText}</p>
 <label className="block mt-2">الفكرة المركزية<input className="field" value={b.idea} onChange={e=>beat(b.id,{idea:e.target.value})}/></label>
 <label className="block mt-2">التعليق / كلام المتحدث<textarea className="field min-h-24" value={b.narration} onChange={e=>beat(b.id,{narration:e.target.value})}/></label>
 <p className={'text-xs '+(wordCount(b.narration)>b.duration*1.8?'text-amber-300':'text-emerald-300')}>{wordCount(b.narration)} كلمة · يناسب الوقت نحو {Math.floor(b.duration*1.8)} كلمة. احتفظ بالفكرة والأدلة عند الاختصار.</p>
 <label className="block mt-2">الأدلة التي تظهر على الشاشة — كل دليل في سطر<textarea className="field" value={b.evidence.join('\n')} onChange={e=>beat(b.id,{evidence:e.target.value.split('\n').filter(Boolean)})}/></label>
 <label className="block mt-2">ما الذي يراه المتعلم؟<textarea className="field" value={b.visual} onChange={e=>beat(b.id,{visual:e.target.value})}/></label>
 <div className="mt-2 flex flex-wrap gap-3"><label>المدة بالثواني<input type="number" min="5" max="1800" className="field w-28" value={b.duration} onChange={e=>beat(b.id,{duration:Number(e.target.value)})}/></label><label>المتحدث<select className="field" value={b.speakerId||''} onChange={e=>beat(b.id,{speakerId:e.target.value||undefined})}><option value="">الراوي العام</option>{value.characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
 <fieldset className="mt-2"><legend>الشخصيات الظاهرة في هذا المشهد</legend>{value.characters.map(c=><label key={c.id} className="inline-flex gap-2 m-2"><input type="checkbox" checked={b.characterIds.includes(c.id)} onChange={e=>beat(b.id,{characterIds:e.target.checked?[...b.characterIds,c.id]:b.characterIds.filter(id=>id!==c.id)})}/>{c.name}</label>)}</fieldset>
 </details>)}</div>{error&&<p role="alert" className="mt-3 text-red-300">{error}</p>}
 </section>;
}
