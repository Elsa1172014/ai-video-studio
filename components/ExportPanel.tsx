'use client';

import Link from 'next/link';

// Final renders are produced per lesson or episode, from their saved clips and voice tracks.
export default function ExportPanel() {
  return (
    <div className="card mt-6 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-purple-400">EXPORT</p>
          <h2 className="font-bold">Final MP4</h2>
          <p className="mt-1 text-sm text-slate-400">Open a lesson or episode and use “Render final video” once its clips are generated.</p>
        </div>
        <Link href="/projects" className="btn primary">My projects</Link>
      </div>
    </div>
  );
}
