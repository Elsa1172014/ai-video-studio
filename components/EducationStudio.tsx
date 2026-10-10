'use client';
// Educational Studio: project -> source -> storyboard -> generate -> review/retry -> final render.
import {useCallback, useEffect, useState} from 'react';
import type {AspectRatio, EducationProject} from '@/lib/types';
import {api, errorText, getQuery, setQuery} from '@/lib/client';
import Storyboard from './Storyboard';
import Production from './Production';

const MINUTES = [0.5, 1, 2, 3, 5, 10, 15, 20];

export default function EducationStudio() {
  const [projects, setProjects] = useState<EducationProject[]>([]);
  const [project, setProject] = useState<EducationProject | null>(null);
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [minutes, setMinutes] = useState(3);
  const [aspect, setAspect] = useState<AspectRatio>('16:9');
  const [voice, setVoice] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [durable, setDurable] = useState(true);

  const refreshList = useCallback(async () => {
    const r = await api<{projects: EducationProject[]; durable: boolean}>('/api/projects');
    setProjects(r.projects); setDurable(r.durable);
  }, []);

  const open = useCallback(async (id: string | null) => {
    setError('');
    if (!id) {setProject(null); setTitle(''); setSource(''); setMinutes(3); setAspect('16:9'); setVoice(''); setQuery({project: undefined}); return;}
    const p = await api<EducationProject>(`/api/projects/${id}`);
    setProject(p); setTitle(p.title); setSource(p.sourceText); setMinutes(p.minutes); setAspect(p.aspectRatio); setVoice(p.narratorVoice?.voiceId || '');
    setQuery({project: p.id, series: undefined, episode: undefined});
  }, []);

  useEffect(() => {
    refreshList().catch(e => setError(errorText(e)));
    const q = getQuery('project');
    if (q) open(q).catch(e => setError(errorText(e)));
  }, [refreshList, open]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label); setError('');
    try {await fn();} catch (e) {setError(errorText(e));} finally {setBusy('');}
  }

  const payload = () => ({title: title.trim() || source.trim().split(/\s+/).slice(0, 8).join(' '), sourceText: source, minutes, aspectRatio: aspect, ...(voice.trim() ? {narratorVoice: {provider: 'tts', voiceId: voice.trim()}} : {})});
  const changed = !project || project.sourceText !== source || project.minutes !== minutes || project.aspectRatio !== aspect || project.title !== title || (project.narratorVoice?.voiceId || '') !== voice.trim();

  async function save() {
    const p = project
      ? await api<EducationProject>(`/api/projects/${project.id}`, {method: 'PATCH', json: payload()})
      : await api<EducationProject>('/api/projects', {method: 'POST', json: payload()});
    setProject(p); setTitle(p.title); setQuery({project: p.id});
    await refreshList();
    return p;
  }
  const build = () => run('Directing…', async () => {
    const p = changed ? await save() : project!;
    setProject(await api<EducationProject>(`/api/projects/${p.id}/storyboard`, {method: 'POST'}));
  });
  const reload = () => project && open(project.id).catch(e => setError(errorText(e)));

  return <>
    <div className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-bold text-purple-400">EDUCATIONAL DIRECTOR</p>
        <select className="ghost rounded-xl p-2 text-sm" value={project?.id || ''} onChange={e => run('Loading…', () => open(e.target.value || null))}>
          <option value="">+ New lesson project</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>
      <h1 className="mt-2 text-3xl font-bold">Paste the lesson. The studio builds the visual teaching flow.</h1>
      {!durable && <p className="mt-2 text-xs text-amber-300">Saved to a local file (no DATABASE_URL). Fine for development; configure Postgres before relying on it in production.</p>}
      <input dir="auto" value={title} onChange={e => setTitle(e.target.value)} className="field mt-5" placeholder="Lesson title"/>
      <textarea dir="auto" value={source} onChange={e => setSource(e.target.value)} className="field mt-4 min-h-48" placeholder="Paste the complete educational text here. Facts and meaning are preserved: every sentence is narrated as written."/>
      <div className="mt-4 flex flex-wrap gap-3">
        <select value={minutes} onChange={e => setMinutes(Number(e.target.value))} className="ghost btn">{MINUTES.map(m => <option key={m} value={m}>{m < 1 ? `${m * 60} seconds` : `${m} minute${m === 1 ? '' : 's'}`}</option>)}</select>
        <select value={aspect} onChange={e => setAspect(e.target.value as AspectRatio)} className="ghost btn"><option value="16:9">16:9 landscape</option><option value="9:16">9:16 vertical</option><option value="1:1">1:1 square</option></select>
        <input value={voice} onChange={e => setVoice(e.target.value)} className="ghost btn w-44 font-normal" placeholder="Narrator voice ID"/>
        <button onClick={() => run('Saving…', async () => {await save();})} disabled={!!busy || source.trim().length < 3} className="btn ghost disabled:opacity-40">{project ? 'Save changes' : 'Save project'}</button>
        <button onClick={build} disabled={!!busy || source.trim().length < 3} className="btn primary disabled:opacity-40">{busy || (project?.storyboard ? 'Rebuild storyboard' : 'Build educational storyboard')}</button>
      </div>
      {project?.storyboard && changed && <p className="mt-2 text-xs text-amber-300">You changed the lesson. Rebuild the storyboard to use the new text.</p>}
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
    </div>
    {project?.storyboard && <>
      <Storyboard kind="project" id={project.id} board={project.storyboard} onChange={reload}/>
      <Production key={project.storyboard.createdAt} kind="project" id={project.id} scenes={project.storyboard.scenes}/>
    </>}
  </>;
}
