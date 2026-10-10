'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import type {EducationProject, Series} from '@/lib/types';
import {api, errorText} from '@/lib/client';

const LEGACY_KEY = 'ai-video-studio-projects-v1';
type Legacy = {id: string; title: string; prompt: string; minutes: number; mode?: string};

export default function Projects() {
  const [projects, setProjects] = useState<EducationProject[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [legacy, setLegacy] = useState<Legacy[]>([]);
  const [durable, setDurable] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [p, s] = await Promise.all([api<{projects: EducationProject[]; durable: boolean}>('/api/projects'), api<{series: Series[]}>('/api/series')]);
      setProjects(p.projects); setSeries(s.series); setDurable(p.durable);
    } catch (e) {setError(errorText(e));}
    try {setLegacy(JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]'));} catch {setLegacy([]);}
  }
  useEffect(() => {load();}, []);

  async function remove(kind: 'projects' | 'series', id: string, title: string) {
    if (!confirm(`Delete “${title}” and all its generated jobs?`)) return;
    try {await api(`/api/${kind}/${id}`, {method: 'DELETE'}); await load();} catch (e) {setError(errorText(e));}
  }
  // Earlier versions kept storyboards only in this browser; move them to the server as lesson projects.
  async function importLegacy() {
    try {
      for (const l of legacy) await api('/api/projects', {method: 'POST', json: {title: (l.title || 'Imported project').slice(0, 160), sourceText: l.prompt, minutes: Math.min(30, Math.max(0.5, l.minutes || 1))}});
      localStorage.removeItem(LEGACY_KEY);
      await load();
    } catch (e) {setError(errorText(e));}
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-purple-400">LIBRARY · saved on the server</p>
          <h1 className="text-3xl font-bold">My video projects</h1>
        </div>
        <Link href="/" className="btn primary">+ New video</Link>
      </div>
      {!durable && <p className="mt-3 text-xs text-amber-300">Using the local development store (no DATABASE_URL configured).</p>}
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      {legacy.length > 0 && <div className="card mt-6 flex items-center justify-between p-4 text-sm">
        <span>{legacy.length} older project(s) are stored only in this browser.</span>
        <button className="btn ghost" onClick={importLegacy}>Move them to the server</button>
      </div>}

      <h2 className="mt-8 text-lg font-bold">Series</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {series.length ? series.map(s => (
          <div className="card p-5" key={s.id}>
            <h3 dir="auto" className="font-bold">{s.title}</h3>
            <p className="mt-2 text-xs text-slate-500">{s.language === 'ar' ? 'Arabic' : 'English'} · {s.aspectRatio} · updated {new Date(s.updatedAt).toLocaleDateString()}</p>
            <div className="mt-4 flex gap-4 text-xs"><Link className="text-purple-300" href={`/?series=${s.id}`}>Open</Link><button type="button" onClick={() => remove('series', s.id, s.title)} className="text-red-400">Delete</button></div>
          </div>
        )) : <div className="card p-6 text-sm text-slate-400">No series yet.</div>}
      </div>

      <h2 className="mt-8 text-lg font-bold">Lessons</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.length ? projects.map(p => (
          <div className="card p-5" key={p.id}>
            <h3 dir="auto" className="font-bold">{p.title}</h3>
            <p dir="auto" className="mt-2 line-clamp-2 text-sm text-slate-400">{p.sourceText}</p>
            <p className="mt-4 text-xs text-slate-500">{p.storyboard ? `${p.storyboard.scenes.length} scenes` : 'no storyboard'} · {p.minutes} min</p>
            <div className="mt-4 flex gap-4 text-xs"><Link className="text-purple-300" href={`/?project=${p.id}`}>Open</Link><button type="button" onClick={() => remove('projects', p.id, p.title)} className="text-red-400">Delete</button></div>
          </div>
        )) : <div className="card p-6 text-sm text-slate-400">No lessons yet.</div>}
      </div>
    </main>
  );
}
