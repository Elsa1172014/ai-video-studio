'use client';
// Series Studio: Series -> Character Bible -> Episode -> Storyboard -> Generate -> Review/retry
// -> Final render -> Save memory -> Next episode (which receives that memory automatically).
import {useCallback, useEffect, useState} from 'react';
import type {AspectRatio, Character, Episode, Language, Series} from '@/lib/types';
import {api, errorText, getQuery, setQuery} from '@/lib/client';
import CharacterBible from './CharacterBible';
import Storyboard from './Storyboard';
import Production from './Production';
import EpisodeMemory from './EpisodeMemory';

const MINUTES = [0.5, 1, 2, 3, 5, 10, 15, 20];
type Full = {series: Series; characters: Character[]; episodes: Episode[]};
type Context = {continuity: string; previousEpisodes: {number: number; title: string; memory?: unknown}[]};

export default function SeriesStudio() {
  const [list, setList] = useState<Series[]>([]);
  const [full, setFull] = useState<Full | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [context, setContext] = useState<Context | null>(null);
  const [newSeries, setNewSeries] = useState({title: '', language: 'ar' as Language, aspectRatio: '16:9' as AspectRatio, style: '', narrator: ''});
  const [draft, setDraft] = useState({title: '', goal: '', minutes: 5});
  const [busy, setBusy] = useState(''), [error, setError] = useState('');

  const run = async (label: string, fn: () => Promise<void>) => {setBusy(label); setError(''); try {await fn();} catch (e) {setError(errorText(e));} finally {setBusy('');}};
  const refreshList = useCallback(async () => setList((await api<{series: Series[]}>('/api/series')).series), []);

  const openSeries = useCallback(async (id: string | null, episodeId?: string | null) => {
    setEpisode(null); setContext(null);
    if (!id) {setFull(null); setQuery({series: undefined, episode: undefined}); return;}
    const f = await api<Full>(`/api/series/${id}`);
    setFull(f);
    setQuery({series: id, episode: episodeId || undefined, project: undefined});
    const ep = episodeId ? f.episodes.find(e => e.id === episodeId) : null;
    if (ep) await openEpisode(ep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openEpisode(ep: Episode | null) {
    setEpisode(ep);
    setQuery({episode: ep?.id});
    if (!ep) return;
    setDraft({title: ep.title, goal: ep.goal, minutes: ep.minutes});
    setContext(await api<Context>(`/api/series/${ep.seriesId}/context?episode=${ep.number}`));
  }
  const reloadSeries = async () => {if (full) {const f = await api<Full>(`/api/series/${full.series.id}`); setFull(f); if (episode) setEpisode(f.episodes.find(e => e.id === episode.id) || null);}};
  const reloadEpisode = async () => {if (episode) setEpisode(await api<Episode>(`/api/episodes/${episode.id}`)); await reloadSeries();};

  useEffect(() => {
    refreshList().catch(e => setError(errorText(e)));
    const s = getQuery('series');
    if (s) openSeries(s, getQuery('episode')).catch(e => setError(errorText(e)));
  }, [refreshList, openSeries]);

  const createSeries = () => run('Creating…', async () => {
    const s = await api<Series>('/api/series', {method: 'POST', json: {
      title: newSeries.title.trim(), language: newSeries.language, aspectRatio: newSeries.aspectRatio,
      ...(newSeries.style.trim() ? {style: newSeries.style.trim()} : {}),
      ...(newSeries.narrator.trim() ? {narratorVoice: {provider: 'tts', voiceId: newSeries.narrator.trim()}} : {}),
    }});
    await refreshList(); await openSeries(s.id);
  });
  const startEpisode = () => run('Creating…', async () => {
    const ep = await api<Episode>(`/api/series/${full!.series.id}/episodes`, {method: 'POST', json: {title: draft.title.trim(), goal: draft.goal, minutes: draft.minutes}});
    await reloadSeries(); await openEpisode(ep);
  });
  const saveEpisode = () => run('Saving…', async () => {
    setEpisode(await api<Episode>(`/api/episodes/${episode!.id}`, {method: 'PATCH', json: {title: draft.title.trim(), goal: draft.goal, minutes: draft.minutes}}));
  });
  const build = () => run('Directing…', async () => {
    if (episode!.goal !== draft.goal || episode!.minutes !== draft.minutes || episode!.title !== draft.title) await api(`/api/episodes/${episode!.id}`, {method: 'PATCH', json: {title: draft.title.trim(), goal: draft.goal, minutes: draft.minutes}});
    setEpisode(await api<Episode>(`/api/episodes/${episode!.id}/storyboard`, {method: 'POST'}));
  });
  const nextEpisode = () => {setEpisode(null); setContext(null); setDraft({title: '', goal: '', minutes: episode?.minutes || 5}); setQuery({episode: undefined});};

  const lockedCount = full?.characters.filter(c => c.locked).length || 0;

  return <>
    <div className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-bold text-purple-400">EPISODE DIRECTOR</p>
        <select className="ghost rounded-xl p-2 text-sm" value={full?.series.id || ''} onChange={e => run('Loading…', () => openSeries(e.target.value || null))}>
          <option value="">+ New series</option>
          {list.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </div>
      <h1 className="mt-2 text-3xl font-bold">Write the next episode. The studio remembers the series.</h1>
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      {!full && <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <input dir="auto" className="field" placeholder="Series title" value={newSeries.title} onChange={e => setNewSeries({...newSeries, title: e.target.value})}/>
        <input dir="auto" className="field" placeholder="Visual style (e.g. warm 3D animation)" value={newSeries.style} onChange={e => setNewSeries({...newSeries, style: e.target.value})}/>
        <select className="field" value={newSeries.language} onChange={e => setNewSeries({...newSeries, language: e.target.value as Language})}><option value="ar">Arabic</option><option value="en">English</option></select>
        <select className="field" value={newSeries.aspectRatio} onChange={e => setNewSeries({...newSeries, aspectRatio: e.target.value as AspectRatio})}><option value="16:9">16:9 landscape</option><option value="9:16">9:16 vertical</option><option value="1:1">1:1 square</option></select>
        <input className="field" placeholder="Narrator voice ID (optional)" value={newSeries.narrator} onChange={e => setNewSeries({...newSeries, narrator: e.target.value})}/>
        <button className="btn primary disabled:opacity-40" disabled={!!busy || !newSeries.title.trim()} onClick={createSeries}>{busy || 'Create series'}</button>
      </div>}

      {full && <>
        <p className="mt-3 text-sm text-slate-400">{full.series.language === 'ar' ? 'Arabic' : 'English'} · {full.series.aspectRatio}{full.series.style ? ` · ${full.series.style}` : ''}{full.series.narratorVoice ? ` · narrator ${full.series.narratorVoice.voiceId}` : ''} · {lockedCount}/{full.characters.length} characters locked</p>
        <CharacterBible seriesId={full.series.id} characters={full.characters} onChange={() => reloadSeries().catch(e => setError(errorText(e)))}/>

        <div className="mt-5 rounded-xl border border-white/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">Episodes</b>
            {episode && <button className="btn ghost" onClick={nextEpisode}>+ Next episode</button>}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {full.episodes.map(e => <button key={e.id} onClick={() => run('Loading…', () => openEpisode(e))}
              className={'rounded-xl border px-3 py-2 text-left text-xs ' + (episode?.id === e.id ? 'border-purple-500 bg-purple-500/10' : 'border-white/10')}>
              <b>Ep {e.number}</b> · {e.title}<br/><span className="text-slate-500">{e.memory ? 'memory saved' : e.storyboard ? 'storyboard' : 'draft'}</span></button>)}
            {!full.episodes.length && <span className="text-xs text-slate-500">No episodes yet.</span>}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{episode ? `Episode ${episode.number}` : `New episode ${(full.episodes.at(-1)?.number || 0) + 1}`}</p>
          <input dir="auto" value={draft.title} onChange={e => setDraft({...draft, title: e.target.value})} className="field mt-2" placeholder="Episode title"/>
          <textarea dir="auto" value={draft.goal} onChange={e => setDraft({...draft, goal: e.target.value})} className="field mt-3 min-h-40" placeholder={'Paste the episode script (Name: line) or describe what happens in this episode.'}/>
          {episode && context && <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-400">
            <b className="text-slate-300">Loaded automatically:</b> {full.characters.length} canonical characters{context.previousEpisodes.length ? ` · memory from ${context.previousEpisodes.filter(p => p.memory).length} of ${context.previousEpisodes.length} earlier episode(s)` : ' · first episode'}
            {context.continuity && <pre dir="auto" className="mt-2 whitespace-pre-wrap font-sans">{context.continuity}</pre>}
            {context.previousEpisodes.some(p => !p.memory) && <p className="mt-2 text-amber-300">Some earlier episodes have no saved memory yet.</p>}
          </div>}
          <div className="mt-4 flex flex-wrap gap-3">
            <select value={draft.minutes} onChange={e => setDraft({...draft, minutes: Number(e.target.value)})} className="ghost btn">{MINUTES.map(m => <option key={m} value={m}>{m < 1 ? `${m * 60} seconds` : `${m} minute${m === 1 ? '' : 's'}`}</option>)}</select>
            {!episode && <button onClick={startEpisode} disabled={!!busy || !draft.title.trim() || draft.goal.trim().length < 3} className="btn primary disabled:opacity-40">{busy || 'Create episode'}</button>}
            {episode && <>
              <button onClick={saveEpisode} disabled={!!busy} className="btn ghost disabled:opacity-40">Save</button>
              <button onClick={build} disabled={!!busy || draft.goal.trim().length < 3} className="btn primary disabled:opacity-40">{busy || (episode.storyboard ? 'Rebuild episode storyboard' : 'Build episode storyboard')}</button>
            </>}
          </div>
          {!full.characters.length && <p className="mt-2 text-xs text-amber-300">Add characters to the Character Bible first so every scene keeps them consistent.</p>}
        </div>
      </>}
    </div>

    {full && episode?.storyboard && <>
      <Storyboard kind="episode" id={episode.id} board={episode.storyboard} characters={full.characters} onChange={() => reloadEpisode().catch(e => setError(errorText(e)))}/>
      <Production key={episode.storyboard.createdAt} kind="episode" id={episode.id} scenes={episode.storyboard.scenes}/>
      <EpisodeMemory key={episode.id + (episode.memory?.savedAt || '')} episode={episode} onSaved={() => reloadEpisode().catch(e => setError(errorText(e)))}/>
    </>}
  </>;
}
