'use client';
import {arabicLabel, arabicNotice} from '@/lib/arabic';
// Post-episode continuity memory: draft (AI or deterministic), review, save. Saved memory is
// loaded automatically when the next episode is planned.
import {useState} from 'react';
import type {Episode, EpisodeMemory as Memory} from '@/lib/types';
import {api, errorText} from '@/lib/client';

const LISTS: [keyof Memory, string][] = [
  ['events', 'الأحداث المهمة'], ['unresolvedThreads', 'الأحداث المعلّقة'], ['relationshipChanges', 'تغيّرات العلاقات'],
  ['locations', 'الأماكن وحالتها'], ['wardrobeProps', 'استمرارية الملابس والأدوات'], ['acquired', 'الإصابات والمقتنيات والمعلومات المكتسبة'],
];

export default function EpisodeMemory({episode, onSaved}: {episode: Episode; onSaved: () => void}) {
  const [m, setM] = useState<Memory | null>(episode.memory || null);
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const run = async (label: string, fn: () => Promise<void>) => {setBusy(label); setError(''); try {await fn();} catch (e) {setError(errorText(e));} finally {setBusy('');}};
  const draft = () => run('جارٍ إعداد المسودة…', async () => setM(await api<Memory>(`/api/episodes/${episode.id}/memory/draft`, {method: 'POST'})));
  const save = () => run('جارٍ الحفظ…', async () => {
    const {savedAt: _, ...body} = m!;
    await api(`/api/episodes/${episode.id}/memory`, {method: 'PUT', json: {...body, source: m!.source === 'deterministic' ? 'manual' : m!.source}});
    onSaved();
  });
  const setList = (k: keyof Memory, v: string) => setM(x => x && ({...x, [k]: v.split('\n').map(s => s.trim()).filter(Boolean)}));

  return <div className="card mt-5 p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-xs text-purple-400">ذاكرة الحلقة · استمرارية أحداث الحلقة {episode.number + 1}</p>
        <h2 className="font-bold">{episode.memory ? `حُفظت في ${new Date(episode.memory.savedAt).toLocaleString('ar-AE')}` : 'لم تُحفظ بعد'}</h2></div>
      <button className="btn ghost" disabled={!!busy} onClick={draft}>{busy === 'جارٍ إعداد المسودة…' ? busy : m ? 'إعادة إعدادها من مخطط المشاهد' : 'إعداد مسودة الذاكرة'}</button>
    </div>
    {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    {m && <div className="mt-4 grid gap-3">
      <label className="text-xs text-slate-500">الملخص</label>
      <textarea dir="auto" className="field min-h-24" value={m.summary} onChange={e => setM({...m, summary: e.target.value})}/>
      <div className="grid gap-3 sm:grid-cols-2">
        {LISTS.map(([k, label]) => <div key={k}><label className="text-xs text-slate-500">{label} · عنصر في كل سطر</label>
          <textarea dir="auto" className="field mt-1 min-h-20" value={(m[k] as string[]).join('\n')} onChange={e => setList(k, e.target.value)}/></div>)}
      </div>
      <label className="text-xs text-slate-500">تغيّرات الشخصيات · سطر لكل «اسم: حالة»</label>
      <textarea dir="auto" className="field min-h-20" value={m.characterStates.map(s => `${s.name}: ${s.state}`).join('\n')}
        onChange={e => setM({...m, characterStates: e.target.value.split('\n').map(l => l.split(':')).filter(p => p[0]?.trim() && p.length > 1).map(([n, ...r]) => ({name: n.trim(), state: r.join(':').trim(), characterId: m.characterStates.find(s => s.name === n.trim())?.characterId}))})}/>
      <label className="text-xs text-slate-500">حالة المشهد الأخير</label>
      <textarea dir="auto" className="field min-h-16" value={m.finalSceneState} onChange={e => setM({...m, finalSceneState: e.target.value})}/>
      <label className="text-xs text-slate-500">ملاحظات للحلقة التالية</label>
      <textarea dir="auto" className="field min-h-16" value={m.nextEpisodeNotes} onChange={e => setM({...m, nextEpisodeNotes: e.target.value})}/>
      <div><button className="btn primary disabled:opacity-40" disabled={!!busy || !m.summary.trim()} onClick={save}>{busy === 'جارٍ الحفظ…' ? busy : 'حفظ ذاكرة الحلقة'}</button>
        <span className="ms-3 text-xs text-slate-500">مصدر المسودة: {arabicLabel(m.source)}</span></div>
    </div>}
  </div>;
}
