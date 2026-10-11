'use client';
import {arabicLabel, arabicNotice, arabicCount} from '@/lib/arabic';
// Generation, voice and final render for one stored episode or educational project.
// All state lives on the server (jobs); this component polls it, so a refresh resumes.
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {Job, OwnerKind, ProductionView, Scene} from '@/lib/types';
import {api, errorText, playable} from '@/lib/client';
import ProductionProgress from './ProductionProgress';
import {getDownloadUrl} from '@vercel/blob';

const ACTIVE = (j?: Job) => !!j && (j.status === 'queued' || j.status === 'processing');
const latest = (jobs: Job[], f: (j: Job) => boolean) => jobs.filter(f).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

type Auto = {video: boolean; audio: boolean; render: boolean};
const autoKey = (id: string) => 'ai-video-auto-' + id;

function Chip({job, label}: {job?: Job; label: string}) {
  const s = job?.status || 'pending';
  const color = s === 'completed' ? 'border-emerald-500/40 text-emerald-300' : s === 'failed' || s === 'cancelled' ? 'border-red-500/40 text-red-300' : s === 'pending' ? 'border-white/10 text-slate-500' : 'border-purple-500/50 text-purple-200 animate-pulse';
  return <span title={job?.error ? arabicNotice(job.error) : arabicLabel(s)} className={'rounded-lg border px-2 py-0.5 text-[11px] ' + color}>{label} · {arabicLabel(s)}</span>;
}

export default function Production({kind, id, scenes, onComplete}: {kind: OwnerKind; id: string; scenes: Scene[]; onComplete?: () => void}) {
  const [view, setView] = useState<ProductionView | null>(null);
  const [auto, setAuto] = useState<Auto>({video: false, audio: false, render: false});
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const submitting = useRef(false);
  const alive = useRef(true);

  const jobs = view?.jobs || [];
  const shots = useMemo(() => scenes.flatMap(s => s.shots.map(sh => ({scene: s, shot: sh}))), [scenes]);
  const shotJob = (shotId: string) => latest(jobs, j => j.type === 'video' && j.shotId === shotId);
  const audioJob = (sceneId: string) => latest(jobs, j => j.type === 'audio' && j.sceneId === sceneId);
  const hasSpeech = (s: Scene) => !!s.narration.trim() || s.dialogue.length > 0;
  const doneClips = shots.filter(x => shotJob(x.shot.id)?.status === 'completed').length;
  const allClips = shots.length > 0 && doneClips === shots.length;
  const final = view?.final;
  const batch = final?.type === 'production';
  const queueId = id + ':' + scenes.map(s => s.id).join(',');

  const load = useCallback(async () => {
    const v = await api<ProductionView>(`/api/productions/${kind}/${id}`);
    if (alive.current) setView(v);
    return v;
  }, [kind, id]);

  // restore + persist the auto-run queue (per viewer convenience; job state itself is server-side)
  useEffect(() => {
    alive.current = true;
    try {const a = JSON.parse(localStorage.getItem(autoKey(queueId)) || 'null'); setAuto(a || {video: false, audio: false, render: false});} catch {}
    load().catch(e => setError(errorText(e)));
    return () => {alive.current = false;};
  }, [queueId, load]);
  useEffect(() => {try {localStorage.setItem(autoKey(queueId), JSON.stringify(auto));} catch {}}, [auto, queueId]);

  // poll active jobs (the server checks the provider and persists results)
  useEffect(() => {
    const active = jobs.filter(ACTIVE);
    if (!active.length) return;
    const t = setTimeout(async () => {
      try {
        await Promise.all(active.map(j => api(`/api/jobs/${j.id}`).catch(() => null)));
        await load();
      } catch (e) {setError(errorText(e));}
    }, 4000);
    return () => clearTimeout(t);
  }, [jobs, load]);

  const submit = useCallback(async (body: Record<string, unknown>) => {
    const r = await api<{job: Job; warnings: string[]}>('/api/jobs', {method: 'POST', json: {ownerKind: kind, ownerId: id, ...body}});
    if (r.warnings?.length) setNotes(n => [...new Set([...n, ...r.warnings])]);
    if (r.job.status === 'failed' && /not configured|authentication|unreachable/i.test(r.job.error || '')) {
      setAuto({video: false, audio: false, render: false});
      throw new Error(r.job.error);
    }
    return r.job;
  }, [kind, id]);

  // queue runner: one video shot and one voice track in flight at a time, then the final render
  useEffect(() => {
    if (!view || submitting.current || batch) return;
    const step = async () => {
      if (auto.video && !jobs.some(j => j.type === 'video' && ACTIVE(j))) {
        const next = shots.find(x => !shotJob(x.shot.id));
        if (next) return submit({type: 'video', sceneId: next.scene.id, shotId: next.shot.id});
        setAuto(a => ({...a, video: false}));
      }
      if (auto.audio && !jobs.some(j => j.type === 'audio' && ACTIVE(j))) {
        const next = scenes.find(s => hasSpeech(s) && !audioJob(s.id));
        if (next) return submit({type: 'audio', sceneId: next.id});
        setAuto(a => ({...a, audio: false}));
      }
      if (auto.render && allClips && !auto.video && !auto.audio && !jobs.some(j => ACTIVE(j))) {
        setAuto(a => ({...a, render: false}));
        return submit({type: 'render'});
      }
    };
    submitting.current = true;
    step().then(j => (j ? load() : null)).catch(e => setError(errorText(e))).finally(() => {submitting.current = false;});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, auto]);

  useEffect(() => {if (final?.status === 'completed') onComplete?.();}, [final?.status, onComplete]);

  async function act(fn: () => Promise<unknown>) {
    setError('');
    try {await fn(); await load();} catch (e) {setError(errorText(e));}
  }
  const produceAll = () => {setAuto({video: false, audio: false, render: false}); return act(() => submit({type: 'production'}));};
  const stopAll = () => setAuto({video: false, audio: false, render: false});
  const running = auto.video || auto.audio || auto.render || jobs.some(ACTIVE);
  const pct = batch ? (final?.status === 'completed' ? 100 : 0) : shots.length ? Math.round((doneClips / shots.length) * 100) : 0;
  const finalUrl = final?.status === 'completed' ? playable(final.output?.url) : undefined;

  return <div className="card mt-5 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs text-purple-400">الإنتاج الكامل · يُحفظ تقدمك تلقائيًا</p>
        <h2 className="font-bold">توليد المشاهد والصوت وإخراج الفيديو</h2>
        <p className="mt-1 text-xs text-slate-400">{arabicCount(scenes.length, 'scene')} · {arabicCount(shots.length, 'shot')} {!batch && <>· اللقطات الجاهزة: {doneClips} من {shots.length}</>} · الحالة: {arabicLabel(view?.status)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {running ? <button onClick={() => {stopAll(); if (final?.type === 'production' && ACTIVE(final)) act(() => api(`/api/jobs/${final.id}/cancel`, {method: 'POST'}));}} className="btn ghost">{final?.type === 'production' ? 'إيقاف الإنتاج' : 'إيقاف قائمة الانتظار مؤقتًا'}</button>
          : final?.status !== 'completed' && <button onClick={produceAll} disabled={!shots.length} className="btn primary disabled:opacity-40">{doneClips ? 'استكمال الإنتاج' : 'إنتاج الفيديو كاملًا'}</button>}
        {!batch && <button onClick={() => act(() => submit({type: 'render', force: final?.status === 'completed'}))} disabled={!allClips || jobs.some(ACTIVE)} className="btn ghost disabled:opacity-40">{final?.status === 'completed' ? 'إعادة إخراج الفيديو' : 'إخراج الفيديو النهائي'}</button>}
      </div>
    </div>
    {final && <ProductionProgress job={final}/>}
    <div className="mt-4 h-2 overflow-hidden rounded bg-white/10"><div className="h-full bg-purple-500 transition-all" style={{width: pct + '%'}}/></div>
    {error && <div className="mt-4 rounded-xl border border-red-500/30 p-3 text-sm text-red-300">{error}</div>}
    <p className="mt-2 text-xs text-slate-400">إنتاج الفيديو الكامل يستمر على الخادم بعد إغلاق الصفحة. توليد اللقطات قد يستغرق وقتًا طويلًا؛ مدة الفيديو ليست مدة الانتظار.</p>
    {final?.progress && ACTIVE(final) && <p role="status" className="mt-3 text-sm text-purple-200">{arabicNotice(final.progress)}</p>}
    {notes.map(n => <p key={n} className="mt-2 text-xs text-amber-300">{arabicNotice(n)}</p>)}

    <div className="mt-4 space-y-2">
      {!batch && scenes.map(s => {
        const a = audioJob(s.id);
        return <div key={s.id} className="rounded-xl border border-white/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b className="text-sm">{s.index + 1}. {s.title} <span className="font-normal text-slate-500">· {s.duration} ث</span></b>
            <div className="flex flex-wrap items-center gap-1.5">
              {s.shots.map((sh, k) => {
                const j = shotJob(sh.id);
                return <span key={sh.id} className="flex items-center gap-1">
                  <Chip job={j} label={`لقطة ${k + 1}`}/>
                  {!j && !auto.video && <button className="text-[11px] text-purple-300" onClick={() => act(() => submit({type: 'video', sceneId: s.id, shotId: sh.id}))}>توليد</button>}
                  {j && (j.status === 'failed' || j.status === 'cancelled') && <button className="text-[11px] text-purple-300" onClick={() => act(() => api(`/api/jobs/${j.id}/retry`, {method: 'POST'}))}>إعادة المحاولة</button>}
                  {j?.status === 'completed' && <button className="text-[11px] text-slate-500 hover:text-white" onClick={() => act(() => submit({type: 'video', sceneId: s.id, shotId: sh.id, force: true}))}>إعادة التوليد</button>}
                  {ACTIVE(j) && <button className="text-[11px] text-slate-500 hover:text-white" onClick={() => act(() => api(`/api/jobs/${j!.id}/cancel`, {method: 'POST'}))}>إلغاء</button>}
                </span>;
              })}
              {hasSpeech(s) && <span className="flex items-center gap-1">
                <Chip job={a} label="الصوت"/>
                {!a && !auto.audio && <button className="text-[11px] text-purple-300" onClick={() => act(() => submit({type: 'audio', sceneId: s.id}))}>توليد</button>}
                {a && (a.status === 'failed' || a.status === 'cancelled') && <button className="text-[11px] text-purple-300" onClick={() => act(() => api(`/api/jobs/${a.id}/retry`, {method: 'POST'}))}>إعادة المحاولة</button>}
              </span>}
            </div>
          </div>
          {[...s.shots.map(sh => shotJob(sh.id)), a].filter(j => j?.error && (j.status === 'failed' || ACTIVE(j))).map(j => <p key={j!.id} className={'mt-2 text-xs ' + (ACTIVE(j) ? 'text-amber-300' : 'text-red-300')}>{ACTIVE(j) ? 'تعذّر تحديث الحالة مؤقتًا؛ جارٍ إعادة المحاولة: ' : ''}{arabicNotice(j!.error)}</p>)}
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {s.shots.map(sh => {const u = playable(shotJob(sh.id)?.output?.url); return u ? <video key={sh.id} src={u} className="h-24 rounded-lg" controls preload="metadata"/> : null;})}
            {a?.status === 'completed' && a.output?.url && <audio src={a.output.url} controls className="h-10 self-center"/>}
          </div>
        </div>;
      })}
    </div>

    <div className="mt-5 rounded-xl border border-white/10 p-4">
      <div className="flex items-center justify-between"><b>الفيديو النهائي</b><Chip job={final} label="الإخراج"/></div>
      {final?.status === 'failed' && <p className="mt-2 text-sm text-red-300">{arabicNotice(final.error)} <button className="text-purple-300" onClick={() => act(() => api(`/api/jobs/${final.id}/retry`, {method: 'POST'}))}>إعادة محاولة الإخراج</button></p>}
      {!allClips && final?.type !== 'production' && <p className="mt-2 text-xs text-slate-500">يتاح الإخراج النهائي بعد اكتمال جميع اللقطات. يجب اكتمال التعليق الصوتي أيضًا؛ لن يُنتج فيديو ناقص الصوت.</p>}
      {finalUrl && <>
        <video className="mt-3 w-full rounded-xl" controls preload="metadata" src={finalUrl}/>
        <a className="btn ghost mt-3 inline-block" href={finalUrl} target="_blank" rel="noreferrer">فتح الفيديو النهائي ↗</a>
        <a className="btn primary ms-3 mt-3 inline-block" href={getDownloadUrl(finalUrl)} download="ai-video-studio.mp4">تنزيل الفيديو MP4</a>
        {final?.output && !final.output.durable && <p className="mt-2 text-xs text-amber-300">الفيديو محفوظ مؤقتًا على خادم التوليد؛ يلزم الحفظ الدائم للاحتفاظ به.</p>}
      </>}
    </div>
  </div>;
}

