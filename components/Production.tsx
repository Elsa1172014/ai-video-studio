'use client';
// Generation, voice and final render for one stored episode or educational project.
// All state lives on the server (jobs); this component polls it, so a refresh resumes.
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {Job, OwnerKind, ProductionView, Scene} from '@/lib/types';
import {api, errorText, playable} from '@/lib/client';

const ACTIVE = (j?: Job) => !!j && (j.status === 'queued' || j.status === 'processing');
const latest = (jobs: Job[], f: (j: Job) => boolean) => jobs.filter(f).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

type Auto = {video: boolean; audio: boolean; render: boolean};
const autoKey = (id: string) => 'ai-video-auto-' + id;

function Chip({job, label}: {job?: Job; label: string}) {
  const s = job?.status || 'pending';
  const color = s === 'completed' ? 'border-emerald-500/40 text-emerald-300' : s === 'failed' || s === 'cancelled' ? 'border-red-500/40 text-red-300' : s === 'pending' ? 'border-white/10 text-slate-500' : 'border-purple-500/50 text-purple-200 animate-pulse';
  return <span title={job?.error || s} className={'rounded-lg border px-2 py-0.5 text-[11px] ' + color}>{label} · {s}</span>;
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

  const load = useCallback(async () => {
    const v = await api<ProductionView>(`/api/productions/${kind}/${id}`);
    if (alive.current) setView(v);
    return v;
  }, [kind, id]);

  // restore + persist the auto-run queue (per viewer convenience; job state itself is server-side)
  useEffect(() => {
    alive.current = true;
    try {const a = JSON.parse(localStorage.getItem(autoKey(id)) || 'null'); if (a) setAuto(a);} catch {}
    load().catch(e => setError(errorText(e)));
    return () => {alive.current = false;};
  }, [id, load]);
  useEffect(() => {try {localStorage.setItem(autoKey(id), JSON.stringify(auto));} catch {}}, [auto, id]);

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
    if (!view || submitting.current) return;
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
  const produceAll = () => {setError(''); setAuto({video: true, audio: true, render: true});};
  const stopAll = () => setAuto({video: false, audio: false, render: false});
  const running = auto.video || auto.audio || auto.render || jobs.some(ACTIVE);
  const pct = shots.length ? Math.round((doneClips / shots.length) * 100) : 0;
  const finalUrl = final?.status === 'completed' ? playable(final.output?.url) : undefined;

  return <div className="card mt-5 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs text-purple-400">FULL PRODUCTION · saved on the server</p>
        <h2 className="font-bold">Generate, voice and render</h2>
        <p className="mt-1 text-xs text-slate-400">{scenes.length} scenes · {shots.length} shots · {doneClips}/{shots.length} clips ready · status: {view?.status || '…'}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {running ? <button onClick={stopAll} className="btn ghost">Pause queue</button>
          : <button onClick={produceAll} disabled={!shots.length} className="btn primary disabled:opacity-40">{doneClips ? 'Resume production' : 'Produce full video'}</button>}
        <button onClick={() => act(() => submit({type: 'render', force: final?.status === 'completed'}))} disabled={!allClips || jobs.some(ACTIVE)} className="btn ghost disabled:opacity-40">{final?.status === 'completed' ? 'Re-render' : 'Render final video'}</button>
      </div>
    </div>
    <div className="mt-4 h-2 overflow-hidden rounded bg-white/10"><div className="h-full bg-purple-500 transition-all" style={{width: pct + '%'}}/></div>
    {error && <div className="mt-4 rounded-xl border border-red-500/30 p-3 text-sm text-red-300">{error}</div>}
    {notes.map(n => <p key={n} className="mt-2 text-xs text-amber-300">{n}</p>)}

    <div className="mt-4 space-y-2">
      {scenes.map(s => {
        const a = audioJob(s.id);
        return <div key={s.id} className="rounded-xl border border-white/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b className="text-sm">{s.index + 1}. {s.title} <span className="font-normal text-slate-500">· {s.duration}s</span></b>
            <div className="flex flex-wrap items-center gap-1.5">
              {s.shots.map((sh, k) => {
                const j = shotJob(sh.id);
                return <span key={sh.id} className="flex items-center gap-1">
                  <Chip job={j} label={`shot ${k + 1}`}/>
                  {!j && !auto.video && <button className="text-[11px] text-purple-300" onClick={() => act(() => submit({type: 'video', sceneId: s.id, shotId: sh.id}))}>generate</button>}
                  {j && (j.status === 'failed' || j.status === 'cancelled') && <button className="text-[11px] text-purple-300" onClick={() => act(() => api(`/api/jobs/${j.id}/retry`, {method: 'POST'}))}>retry</button>}
                  {j?.status === 'completed' && <button className="text-[11px] text-slate-500 hover:text-white" onClick={() => act(() => submit({type: 'video', sceneId: s.id, shotId: sh.id, force: true}))}>redo</button>}
                  {ACTIVE(j) && <button className="text-[11px] text-slate-500 hover:text-white" onClick={() => act(() => api(`/api/jobs/${j!.id}/cancel`, {method: 'POST'}))}>cancel</button>}
                </span>;
              })}
              {hasSpeech(s) && <span className="flex items-center gap-1">
                <Chip job={a} label="voice"/>
                {!a && !auto.audio && <button className="text-[11px] text-purple-300" onClick={() => act(() => submit({type: 'audio', sceneId: s.id}))}>generate</button>}
                {a && (a.status === 'failed' || a.status === 'cancelled') && <button className="text-[11px] text-purple-300" onClick={() => act(() => api(`/api/jobs/${a.id}/retry`, {method: 'POST'}))}>retry</button>}
              </span>}
            </div>
          </div>
          {[...s.shots.map(sh => shotJob(sh.id)), a].filter(j => j?.error && j.status === 'failed').map(j => <p key={j!.id} className="mt-2 text-xs text-red-300">{j!.error}</p>)}
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {s.shots.map(sh => {const u = playable(shotJob(sh.id)?.output?.url); return u ? <video key={sh.id} src={u} className="h-24 rounded-lg" controls preload="metadata"/> : null;})}
            {a?.status === 'completed' && a.output?.url && <audio src={a.output.url} controls className="h-10 self-center"/>}
          </div>
        </div>;
      })}
    </div>

    <div className="mt-5 rounded-xl border border-white/10 p-4">
      <div className="flex items-center justify-between"><b>Final video</b><Chip job={final} label="render"/></div>
      {final?.status === 'failed' && <p className="mt-2 text-sm text-red-300">{final.error} <button className="text-purple-300" onClick={() => act(() => api(`/api/jobs/${final.id}/retry`, {method: 'POST'}))}>Retry render</button></p>}
      {!allClips && <p className="mt-2 text-xs text-slate-500">The final render unlocks when every shot has a completed clip. Scenes without a finished voice track are rendered silent.</p>}
      {finalUrl && <>
        <video className="mt-3 w-full rounded-xl" controls preload="metadata" src={finalUrl}/>
        <a className="btn ghost mt-3 inline-block" href={finalUrl} target="_blank" rel="noreferrer">Open final MP4 ↗</a>
        {final?.output && !final.output.durable && <p className="mt-2 text-xs text-amber-300">Stored on the GPU worker / local disk only. Configure durable storage to keep it permanently.</p>}
      </>}
    </div>
  </div>;
}

