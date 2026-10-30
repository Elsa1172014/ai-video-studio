'use client';

import {useState} from 'react';

type Result={status?:string;jobId?:string;outputUrl?:string;url?:string;message?:string;error?:string};
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function read(r:Response):Promise<Result>{const t=await r.text();try{return JSON.parse(t)}catch{return{status:'failed',error:t||('HTTP '+r.status)}}}

/** Voice, reference upload and dubbing utilities. Generated URLs can be pasted into the cinematic finish. */
export default function MediaControls() {
  const [tab,setTab] = useState<'voice'|'upload'|'dub'>('voice');
  const [content,setContent] = useState('مرحباً بكم في استوديو الفيديو بالذكاء الاصطناعي.');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [url,setUrl] = useState('');

  async function poll(job:Result):Promise<Result>{
    let current=job;
    while(current.jobId&&(current.status==='queued'||current.status==='processing')){await wait(2500);current=await read(await fetch('/api/jobs/'+encodeURIComponent(current.jobId),{cache:'no-store'}))}
    return current;
  }

  async function generateVoice() {
    setBusy(true);setMessage('جارٍ توليد التعليق الصوتي…');setUrl('');
    try {
      const response = await fetch('/api/voice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:content,language:'ar',voice:'default'})});
      const data = await poll(await read(response));
      if(data.status==='completed'&&data.outputUrl){setUrl(data.outputUrl);setMessage('التعليق الصوتي جاهز. الصق رابطه في خانة «تعليق صوتي» ضمن المونتاج السينمائي.')}
      else setMessage(data.error||data.message||'تعذّر توليد الصوت');
    } catch (error) {setMessage(error instanceof Error ? error.message : 'تعذّر توليد الصوت')}
    finally{setBusy(false)}
  }

  async function upload(file?:File|null){
    if(!file)return;setBusy(true);setMessage('جارٍ الرفع…');setUrl('');
    try{
      const form=new FormData();form.append('file',file);
      const data=await read(await fetch('/api/media',{method:'POST',body:form}));
      if(data.url){setUrl(data.url);setMessage('تم الرفع. استخدم هذا الرابط صورةً مرجعية أو موسيقى خلفية أو تعليقاً صوتياً.')}
      else setMessage(data.error||'تعذّر الرفع');
    }catch(e){setMessage(e instanceof Error?e.message:'تعذّر الرفع')}finally{setBusy(false)}
  }

  async function dub(){
    setBusy(true);setUrl('');
    try{const data=await read(await fetch('/api/dub',{method:'POST'}));setMessage(data.error||data.message||'أُرسل')}
    finally{setBusy(false)}
  }

  const tabClass=(t:string)=>'btn '+(tab===t?'primary':'ghost');
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => {setTab('voice');setMessage('');setUrl('')}} className={tabClass('voice')}>التعليق الصوتي</button>
        <button type="button" onClick={() => {setTab('upload');setMessage('');setUrl('')}} className={tabClass('upload')}>رفع الوسائط</button>
        <button type="button" onClick={() => {setTab('dub');setMessage('');setUrl('')}} className={tabClass('dub')}>الدبلجة</button>
      </div>

      {tab === 'voice' && (
        <div className="mt-5">
          <textarea value={content} onChange={event => setContent(event.target.value)} className="min-h-28 w-full rounded-xl border border-white/10 bg-black/20 p-4" dir="auto" />
          <button type="button" onClick={generateVoice} disabled={busy||!content.trim()} className="btn primary mt-3 disabled:opacity-40">{busy?'جارٍ التنفيذ…':'ولّد تعليقاً صوتياً عربياً'}</button>
          <p className="mt-2 text-xs text-slate-500">يستخدم محرّك تحويل النص إلى صوت المُعدّ على الخادم.</p>
        </div>
      )}

      {tab === 'upload' && (
        <div className="mt-5 rounded-xl border border-dashed border-white/15 p-6">
          <b>صورة مرجعية للشخصية أو موسيقى أو تعليق صوتي</b>
          <p className="mt-2 text-sm text-slate-400">يُحفظ على الخادم ويُعاد إليك رابطاً تستخدمه لاحقاً. الحد الأقصى ٥٠ ميغابايت.</p>
          <input type="file" accept="image/*,audio/*,video/*" disabled={busy} onChange={e=>upload(e.target.files?.[0])} className="mt-4 block text-sm" />
        </div>
      )}

      {tab === 'dub' && (
        <div className="mt-5">
          <p className="text-sm text-slate-400">دبلجة بين العربية والإنجليزية: تفريغ النص ← ترجمة ← تحويل إلى صوت ← ضبط التوقيت.</p>
          <button type="button" onClick={dub} disabled={busy} className="btn ghost mt-3">تحقّق من توفّر الدبلجة</button>
        </div>
      )}

      {message && <p className="mt-4 text-sm text-purple-300">{message}</p>}
      {url && <div className="mt-3 space-y-2">
        {/\.(wav|mp3|m4a|ogg)(\?|$)/i.test(url)&&<audio controls src={url} className="w-full"/>}
        <div className="flex gap-2"><input readOnly value={url} className="field ltr !p-2.5 text-xs" onFocus={e=>e.currentTarget.select()}/><button type="button" className="btn ghost shrink-0 text-xs" onClick={()=>navigator.clipboard?.writeText(url)}>نسخ</button></div>
      </div>}
    </div>
  );
}
