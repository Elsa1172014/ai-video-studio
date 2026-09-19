'use client';

import {useState} from 'react';
import MediaControls from '@/components/MediaControls';
import Timeline from '@/components/Timeline';
import ExportPanel from '@/components/ExportPanel';

const stages = ['Script','Scenes','Voice','Avatar','Lip Sync','Captions','Render'];

export default function Studio() {
  const [active,setActive] = useState(0);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-purple-400">PRODUCTION STUDIO</p>
          <h1 className="text-3xl font-bold">Long Video Pipeline</h1>
        </div>
        <a href="/" className="btn ghost">← Director</a>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-7">
        {stages.map((stage,index) => (
          <button
            type="button"
            onClick={() => setActive(index)}
            key={stage}
            className={'rounded-xl border p-3 text-sm ' + (active === index ? 'border-purple-500 bg-purple-500/15' : 'border-white/10')}
          >
            {index + 1}. {stage}
          </button>
        ))}
      </div>

      <div className="card mt-6 p-8">
        <h2 className="text-2xl font-bold">{stages[active]}</h2>
        <p className="mt-3 text-slate-400">
          Build each production layer, then render the final long-form video.
        </p>
        <div className="mt-6 rounded-xl border border-white/10 p-5">
          <MediaControls />
        </div>
        <Timeline />
        <ExportPanel />
      </div>
    </main>
  );
}
