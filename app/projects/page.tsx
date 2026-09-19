'use client';

import Link from 'next/link';
import {useEffect,useState} from 'react';
import {loadProjects,removeProject,VideoProject} from '@/lib/project-store';

export default function Projects() {
  const [projects,setProjects] = useState<VideoProject[]>([]);

  useEffect(() => {
    setProjects(loadProjects());
  }, []);

  function remove(id:string) {
    removeProject(id);
    setProjects(loadProjects());
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-purple-400">LIBRARY</p>
          <h1 className="text-3xl font-bold">My video projects</h1>
        </div>
        <Link href="/" className="btn primary">+ New video</Link>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.length ? projects.map(project => (
          <div className="card p-5" key={project.id}>
            <h2 className="font-bold">{project.title}</h2>
            <p className="mt-2 line-clamp-2 text-sm text-slate-400">{project.prompt}</p>
            <p className="mt-4 text-xs text-slate-500">
              {project.scenes.length} scenes · {project.minutes} min
            </p>
            <button
              type="button"
              onClick={() => remove(project.id)}
              className="mt-4 text-xs text-red-400"
            >
              Delete
            </button>
          </div>
        )) : (
          <div className="card p-8 text-slate-400">
            No projects yet. Create your first AI video.
          </div>
        )}
      </div>
    </main>
  );
}
