'use client';
import {arabicLabel, arabicNotice} from '@/lib/arabic';

import {useState} from 'react';

export default function MediaControls() {
  const [tab,setTab] = useState<'voice'|'avatar'|'dub'>('voice');
  const [content,setContent] = useState('مرحباً بكم في استوديو الفيديو بالذكاء الاصطناعي.');
  const [message,setMessage] = useState('');

  async function generateVoice() {
    setMessage('جارٍ التنفيذ…');
    try {
      const response = await fetch('/api/voice',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:content,language:'ar',voice:'default'})
      });
      const data = await response.json();
      setMessage(arabicNotice(data.message || data.status || data.error) || 'تم إرسال الطلب');
    } catch (error) {
      setMessage(arabicNotice(error instanceof Error ? error.message : 'تعذّر توليد الصوت'));
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setTab('voice')} className="btn ghost">الصوت</button>
        <button type="button" onClick={() => setTab('avatar')} className="btn ghost">الشخصية الافتراضية</button>
        <button type="button" onClick={() => setTab('dub')} className="btn ghost">الدبلجة</button>
      </div>

      {tab === 'voice' && (
        <div className="mt-5">
          <textarea value={content} onChange={event => setContent(event.target.value)} className="min-h-28 w-full rounded-xl border border-white/10 bg-black/20 p-4" dir="auto" />
          <button type="button" onClick={generateVoice} className="btn primary mt-3">توليد التعليق الصوتي العربي</button>
        </div>
      )}

      {tab === 'avatar' && (
        <div className="mt-5 rounded-xl border border-dashed border-white/15 p-8">
          <b>صورة الشخصية الافتراضية</b>
          <p className="mt-2 text-sm text-slate-400">هذه واجهة تجريبية؛ توليد الشخصية الافتراضية غير متاح بعد.</p>
          <input type="file" accept="image/*" className="mt-4 block text-sm" />
        </div>
      )}

      {tab === 'dub' && (
        <div className="mt-5">
          <p className="text-sm text-slate-400">الدبلجة بين العربية والإنجليزية قيد التطوير: تفريغ النص، ثم ترجمته وتوليد الصوت وضبط التوقيت.</p>
          <input type="file" accept="video/*,audio/*" className="mt-4 block text-sm" />
        </div>
      )}

      {message && <p className="mt-4 text-sm text-purple-300">{message}</p>}
    </div>
  );
}
