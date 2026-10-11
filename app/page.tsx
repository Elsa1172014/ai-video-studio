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
    <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-6 py-4"><b className="text-xl">استوديو الفيديو بالذكاء الاصطناعي</b><span className="ms-3 text-sm text-purple-400">للتعليم وصناعة المسلسلات</span>
      <div className="flex flex-wrap items-center gap-5 ms-auto"><SystemStatus/><Link href="/studio" className="text-sm text-purple-300">استوديو الإنتاج</Link><Link href="/projects" className="text-sm text-slate-300">مشروعاتي ←</Link></div></header>
    <div className="mx-auto max-w-7xl p-6">
      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <button onClick={() => pick('education')} className={'mode-card ' + (mode === 'education' ? 'mode-active' : '')}><span className="mode-icon">درس</span><div><p className="text-xs font-bold uppercase tracking-widest text-cyan-300">الاستوديو التعليمي</p><h2 className="mt-1 text-2xl font-bold">حوّل نص الدرس إلى شرح مرئي</h2><p className="mt-2 text-sm text-slate-400">يحافظ على محتوى الدرس ويصمم مشاهده التعليمية تلقائيًا.</p></div></button>
        <button onClick={() => pick('series')} className={'mode-card ' + (mode === 'series' ? 'mode-active' : '')}><span className="mode-icon">حلقة</span><div><p className="text-xs font-bold uppercase tracking-widest text-purple-300">استوديو المسلسلات</p><h2 className="mt-1 text-2xl font-bold">أنشئ حلقات بشخصيات ثابتة</h2><p className="mt-2 text-sm text-slate-400">دليل الشخصيات وذاكرة الحلقات يحافظان على ترابط أحداث المسلسل.</p></div></button>
      </section>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section>{mode === 'education' ? <EducationStudio/> : <SeriesStudio/>}</section>
        <aside className="space-y-4">
          <div className="card p-5"><h3 className="font-bold">{mode === 'education' ? 'ضوابط المحتوى التعليمي' : 'دليل المسلسل'}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">{mode === 'education'
              ? 'النص هو المرجع: تُروى جمل الدرس كما كتبتها وتُحوّل إلى مشاهد دون إضافة معلومات. تتناسب مدة المشهد مع الفكرة التعليمية.'
              : 'تُحفظ المسلسلات والشخصيات والأصوات وذاكرة الحلقات. تُثبّت هوية الشخصيات المقفلة، وتستفيد كل حلقة جديدة تلقائيًا من ذاكرة الحلقات السابقة.'}</p></div>
          <div className="card p-5"><h3 className="font-bold">مراحل الإنتاج</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">مخطط المشاهد ← توليد اللقطات ← التعليق الصوتي ← فيديو نهائي بالصوت. يُحفظ التقدم لتستكمل لاحقًا أو تعيد لقطة واحدة فقط.</p>
            <Link href="/projects" className="btn primary mt-4 block text-center">فتح مشروعاتي</Link></div>
        </aside>
      </div>
    </div>
  </main>;
}
