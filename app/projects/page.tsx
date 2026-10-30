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
          <p className="text-sm text-purple-400">المكتبة</p>
          <h1 className="text-3xl font-bold">مشاريع الفيديو</h1>
        </div>
        <Link href="/" className="btn primary">+ فيديو جديد</Link>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.length ? projects.map(project => (
          <div className="card p-5" key={project.id}>
            <h2 className="font-bold">{project.title}</h2>
            <p className="mt-2 line-clamp-2 text-sm text-slate-400">{project.prompt}</p>
            <p className="mt-4 text-xs text-slate-500">
              {project.scenes.length} مشاهد · {project.minutes} دقيقة
            </p>
            <div className="mt-4 flex items-center gap-4">
              <Link href={'/studio?id='+encodeURIComponent(project.id)} className="text-xs font-bold text-purple-300">افتح في الاستوديو ←</Link>
              <button
                type="button"
                onClick={() => remove(project.id)}
                className="text-xs text-red-400"
              >
                حذف
              </button>
            </div>
          </div>
        )) : (
          <div className="card p-8 text-slate-400">
            لا توجد مشاريع بعد. أنشئ أول فيديو بالذكاء الاصطناعي.
          </div>
        )}
      </div>
    </main>
  );
}
