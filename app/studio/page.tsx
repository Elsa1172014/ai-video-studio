'use client';

import Link from 'next/link';
import {useEffect,useState} from 'react';
import MediaControls from '@/components/MediaControls';
import Timeline from '@/components/Timeline';
import FullVideoGenerator from '@/components/FullVideoGenerator';
import SystemStatus from '@/components/SystemStatus';
import {loadProjects,type VideoProject} from '@/lib/project-store';

/** Production Studio: the real project timeline, media utilities and the cinematic finish for a saved project. */
export default function Studio() {
  const [projects,setProjects] = useState<VideoProject[]>([]);
  const [projectId,setProjectId] = useState('');
  const [selected,setSelected] = useState(0);
  const [ready,setReady] = useState(false);

  useEffect(() => {
    const all=loadProjects();setProjects(all);
    const requested=new URLSearchParams(window.location.search).get('id');
    setProjectId(all.find(p=>p.id===requested)?.id||all[0]?.id||'');
    setReady(true);
  }, []);

  function choose(id:string){
    setProjectId(id);setSelected(0);
    const url=new URL(window.location.href);url.searchParams.set('id',id);window.history.replaceState(null,'',url);
  }

  const project=projects.find(p=>p.id===projectId);
  const scene=project?.scenes[selected];

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-purple-400">PRODUCTION STUDIO</p>
          <h1 className="text-3xl font-bold">{project?.title||'Long Video Pipeline'}</h1>
        </div>
        <div className="flex items-center gap-4"><SystemStatus/><Link href="/projects" className="btn ghost">Projects</Link><Link href="/" className="btn ghost">← Director</Link></div>
      </div>

      {ready&&!project&&<div className="card mt-6 p-8"><h2 className="text-xl font-bold">No projects yet</h2><p className="mt-2 text-slate-400">Build a storyboard on the Director page first; it will appear here for production and finishing.</p><Link href="/" className="btn primary mt-5 inline-block">Create a storyboard</Link></div>}

      {project&&<>
        {projects.length>1&&<select value={project.id} onChange={e=>choose(e.target.value)} className="field mt-5 max-w-md !p-3 text-sm">{projects.map(p=><option key={p.id} value={p.id}>{p.title} · {p.scenes.length} scenes</option>)}</select>}
        <div className="card mt-6 p-6">
          <Timeline scenes={project.scenes} selected={selected} onSelect={setSelected}/>
          {scene&&<div className="mt-4 rounded-xl border border-white/10 p-4 text-sm"><b>{selected+1}. {scene.title}</b><span className="ml-2 text-xs text-slate-500">{scene.duration}s</span><p dir="auto" className="mt-2 text-slate-300">{scene.sourceText}</p></div>}
        </div>
        <FullVideoGenerator scenes={project.scenes} title={project.title} characterImageUrl={project.characters?.find(c=>c.imageUrl)?.imageUrl}/>
        <div className="card mt-6 p-6"><p className="text-xs text-purple-400">MEDIA</p><h2 className="mb-4 font-bold">Narration, uploads and dubbing</h2><MediaControls/></div>
      </>}
    </main>
  );
}
