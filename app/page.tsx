'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import SystemStatus from '@/components/SystemStatus';
import EducationStudio from '@/components/EducationStudio';
import SeriesStudio from '@/components/SeriesStudio';
import {getQuery, setQuery} from '@/lib/client';

type Mode = 'education' | 'series';

export default function Home() {
  const [mode, setMode] = useState<Mode>('education');
  useEffect(() => {if (getQuery('series')) setMode('series');}, []);
  const pick = (m: Mode) => {setMode(m); setQuery({series: undefined, episode: undefined, project: undefined});};
  return <main className="min-h-screen">
    <header className="border-b border-white/10 px-6 py-4"><b className="text-xl">AI Video Studio</b><span className="ml-3 text-sm text-purple-400">Two production engines</span>
      <div className="float-right flex items-center gap-5"><SystemStatus/><Link href="/studio" className="text-sm text-purple-300">Production Studio</Link><Link href="/projects" className="text-sm text-slate-300">My Projects →</Link></div></header>
    <div className="mx-auto max-w-7xl p-6">
      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <button onClick={() => pick('education')} className={'mode-card ' + (mode === 'education' ? 'mode-active' : '')}><span className="mode-icon">EDU</span><div><p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Educational Studio</p><h2 className="mt-1 text-2xl font-bold">Turn lesson text into a visual explanation</h2><p className="mt-2 text-sm text-slate-400">Preserves teaching content and designs the learning scenes automatically.</p></div></button>
        <button onClick={() => pick('series')} className={'mode-card ' + (mode === 'series' ? 'mode-active' : '')}><span className="mode-icon">SER</span><div><p className="text-xs font-bold uppercase tracking-widest text-purple-300">Series Studio</p><h2 className="mt-1 text-2xl font-bold">Build episodes with persistent characters</h2><p className="mt-2 text-sm text-slate-400">Character Bible + Episode Memory keep your series world consistent.</p></div></button>
      </section>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section>{mode === 'education' ? <EducationStudio/> : <SeriesStudio/>}</section>
        <aside className="space-y-4">
          <div className="card p-5"><h3 className="font-bold">{mode === 'education' ? 'Educational rules' : 'Series Bible'}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">{mode === 'education'
              ? 'Source-first: every sentence of your lesson is narrated as written and visualised without adding facts. Scene length follows each teaching beat (10–60 s).'
              : 'Series, characters, voices and episode memory are saved on the server. Locked characters cannot change silently, and each new episode automatically receives the memory of the episodes before it.'}</p></div>
          <div className="card p-5"><h3 className="font-bold">Production engine</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">Storyboard → GPU shots → scene voices → final MP4 with audio. Every job is saved, so you can close the page and resume, and retry a single shot without restarting.</p>
            <Link href="/projects" className="btn primary mt-4 block text-center">Open my projects</Link></div>
        </aside>
      </div>
    </div>
  </main>;
}
