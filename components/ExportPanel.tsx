'use client';

import Link from 'next/link';

// Final renders are produced per lesson or episode, from their saved clips and voice tracks.
export default function ExportPanel() {
  return (
    <div className="card mt-6 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-purple-400">التصدير</p>
          <h2 className="font-bold">الفيديو النهائي MP4</h2>
          <p className="mt-1 text-sm text-slate-400">افتح درسًا أو حلقة واختر «إخراج الفيديو النهائي» بعد اكتمال اللقطات.</p>
        </div>
        <Link href="/projects" className="btn primary">مشروعاتي</Link>
      </div>
    </div>
  );
}
