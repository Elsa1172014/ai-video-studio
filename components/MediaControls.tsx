'use client';

import {useState} from 'react';

export default function MediaControls() {
  const [tab,setTab] = useState<'voice'|'avatar'|'dub'>('voice');
  const [content,setContent] = useState('مرحباً بكم في استوديو الفيديو بالذكاء الاصطناعي.');
  const [message,setMessage] = useState('');

  async function generateVoice() {
    setMessage('Working…');
    try {
      const response = await fetch('/api/voice',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:content,language:'ar',voice:'default'})
      });
      const data = await response.json();
      setMessage(data.message || data.status || data.error || 'Submitted');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Voice generation failed');
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setTab('voice')} className="btn ghost">Voice</button>
        <button type="button" onClick={() => setTab('avatar')} className="btn ghost">Avatar</button>
        <button type="button" onClick={() => setTab('dub')} className="btn ghost">Dubbing</button>
      </div>

      {tab === 'voice' && (
        <div className="mt-5">
          <textarea value={content} onChange={event => setContent(event.target.value)} className="min-h-28 w-full rounded-xl border border-white/10 bg-black/20 p-4" dir="auto" />
          <button type="button" onClick={generateVoice} className="btn primary mt-3">Generate Arabic voice</button>
        </div>
      )}

      {tab === 'avatar' && (
        <div className="mt-5 rounded-xl border border-dashed border-white/15 p-8">
          <b>Avatar source</b>
          <p className="mt-2 text-sm text-slate-400">Image upload UI is ready; persistent media storage will be connected to object storage.</p>
          <input type="file" accept="image/*" className="mt-4 block text-sm" />
        </div>
      )}

      {tab === 'dub' && (
        <div className="mt-5">
          <p className="text-sm text-slate-400">Arabic ↔ English dubbing pipeline: transcription → translation → TTS → timing.</p>
          <input type="file" accept="video/*,audio/*" className="mt-4 block text-sm" />
        </div>
      )}

      {message && <p className="mt-4 text-sm text-purple-300">{message}</p>}
    </div>
  );
}
