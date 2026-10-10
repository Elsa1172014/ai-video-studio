'use client';
// Post-episode continuity memory: draft (AI or deterministic), review, save. Saved memory is
// loaded automatically when the next episode is planned.
import {useState} from 'react';
import type {Episode, EpisodeMemory as Memory} from '@/lib/types';
import {api, errorText} from '@/lib/client';

const LISTS: [keyof Memory, string][] = [
  ['events', 'Important events'], ['unresolvedThreads', 'Unresolved plot threads'], ['relationshipChanges', 'Relationship changes'],
  ['locations', 'Locations / state'], ['wardrobeProps', 'Wardrobe & prop continuity'], ['acquired', 'Injuries, objects, knowledge acquired'],
];

export default function EpisodeMemory({episode, onSaved}: {episode: Episode; onSaved: () => void}) {
  const [m, setM] = useState<Memory | null>(episode.memory || null);
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const run = async (label: string, fn: () => Promise<void>) => {setBusy(label); setError(''); try {await fn();} catch (e) {setError(errorText(e));} finally {setBusy('');}};
  const draft = () => run('Drafting…', async () => setM(await api<Memory>(`/api/episodes/${episode.id}/memory/draft`, {method: 'POST'})));
  const save = () => run('Saving…', async () => {
    const {savedAt: _, ...body} = m!;
    await api(`/api/episodes/${episode.id}/memory`, {method: 'PUT', json: {...body, source: m!.source === 'deterministic' ? 'manual' : m!.source}});
    onSaved();
  });
  const setList = (k: keyof Memory, v: string) => setM(x => x && ({...x, [k]: v.split('\n').map(s => s.trim()).filter(Boolean)}));

  return <div className="card mt-5 p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-xs text-purple-400">EPISODE MEMORY · continuity for episode {episode.number + 1}</p>
        <h2 className="font-bold">{episode.memory ? `Saved ${new Date(episode.memory.savedAt).toLocaleString()}` : 'Not saved yet'}</h2></div>
      <button className="btn ghost" disabled={!!busy} onClick={draft}>{busy === 'Drafting…' ? busy : m ? 'Redraft from storyboard' : 'Draft memory'}</button>
    </div>
    {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    {m && <div className="mt-4 grid gap-3">
      <label className="text-xs text-slate-500">Summary</label>
      <textarea dir="auto" className="field min-h-24" value={m.summary} onChange={e => setM({...m, summary: e.target.value})}/>
      <div className="grid gap-3 sm:grid-cols-2">
        {LISTS.map(([k, label]) => <div key={k}><label className="text-xs text-slate-500">{label} · one per line</label>
          <textarea dir="auto" className="field mt-1 min-h-20" value={(m[k] as string[]).join('\n')} onChange={e => setList(k, e.target.value)}/></div>)}
      </div>
      <label className="text-xs text-slate-500">Character state changes · “Name: state” per line</label>
      <textarea dir="auto" className="field min-h-20" value={m.characterStates.map(s => `${s.name}: ${s.state}`).join('\n')}
        onChange={e => setM({...m, characterStates: e.target.value.split('\n').map(l => l.split(':')).filter(p => p[0]?.trim() && p.length > 1).map(([n, ...r]) => ({name: n.trim(), state: r.join(':').trim(), characterId: m.characterStates.find(s => s.name === n.trim())?.characterId}))})}/>
      <label className="text-xs text-slate-500">Final scene state</label>
      <textarea dir="auto" className="field min-h-16" value={m.finalSceneState} onChange={e => setM({...m, finalSceneState: e.target.value})}/>
      <label className="text-xs text-slate-500">Notes for the next episode</label>
      <textarea dir="auto" className="field min-h-16" value={m.nextEpisodeNotes} onChange={e => setM({...m, nextEpisodeNotes: e.target.value})}/>
      <div><button className="btn primary disabled:opacity-40" disabled={!!busy || !m.summary.trim()} onClick={save}>{busy === 'Saving…' ? busy : 'Save memory to series'}</button>
        <span className="ml-3 text-xs text-slate-500">Drafted by: {m.source}</span></div>
    </div>}
  </div>;
}
