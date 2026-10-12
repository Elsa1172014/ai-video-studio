'use client';
import './studio.css';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CastPanel } from '@/components/studio/CastPanel';
import { ProgressReel } from '@/components/studio/ProgressReel';
import { Storyboard } from '@/components/studio/Storyboard';
import { TimeDial } from '@/components/studio/TimeDial';
import { hashScene, loadPersisted, makeApi, type Engine, playable, savePersisted, usableSaved, type Persisted } from '@/lib/clientApi';
import { formatClock } from '@/lib/planner';
import { buildPlan } from '@/lib/plan';
import { etaSeconds, producedSeconds } from '@/lib/progress';
import { initialState, runProduction, type RunState, type SceneInput } from '@/lib/runner';
import { analyzeStory, buildScenes, type Lang, type StoryBible } from '@/lib/story';
import { fill, tr } from '@/lib/studio-i18n';

type StepId = 0 | 1 | 2 | 3;

export default function StoryStudio() {
  const [lang, setLang] = useState<Lang>('ar');
  const [text, setText] = useState('');
  const [total, setTotal] = useState(60);
  const [bible, setBible] = useState<StoryBible | null>(null);
  const [engine, setEngine] = useState<Engine>('auto');
  const [step, setStep] = useState<StepId>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [run, setRun] = useState<RunState | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  const abort = useRef<AbortController | null>(null);
  const persisted = useRef<Persisted | undefined>(undefined);
  const s = tr(lang);

  // Restore the previous session (story, length, bible, finished scenes).
  useEffect(() => {
    const p = loadPersisted();
    if (!p) return;
    persisted.current = p;
    setText(p.text);
    setTotal(p.minutes * 60 + p.seconds);
    setLang(p.lang);
    if (p.engine) setEngine(p.engine);
    if (p.bible) {
      setBible(p.bible);
      setStep(2);
    }
  }, []);

  const scenes = useMemo(() => (bible ? buildScenes(bible, total) : []), [bible, total]);
  const inputs: SceneInput[] = useMemo(() => scenes.map(({ id, prompt, duration, continuity }) => ({ id, prompt, duration, continuity })), [scenes]);
  const view: RunState = run ?? initialState(inputs, usableSaved(persisted.current, inputs));
  const running = run?.phase === 'running' || run?.phase === 'joining';

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const remember = useCallback((patch: Partial<Persisted>) => {
    const next: Persisted = { text, minutes: Math.floor(total / 60), seconds: total % 60, lang, saved: {}, ...persisted.current, ...patch };
    persisted.current = next;
    savePersisted(next);
  }, [text, total, lang]);

  useEffect(() => {
    if (text || bible) remember({ text, minutes: Math.floor(total / 60), seconds: total % 60, lang, engine, bible: bible ?? undefined });
  }, [text, total, lang, engine, bible, remember]);

  async function analyze() {
    setError('');
    if (text.trim().length < 10) return setError(s.needStory);
    if (total < 1) return setError(s.needTime);
    setBusy(true);
    try {
      const r = await fetch('/api/story/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, minutes: Math.floor(total / 60), seconds: total % 60 }) });
      const data = (await r.json()) as { bible?: StoryBible; error?: string };
      if (!r.ok || !data.bible) throw new Error(data.error || `Analysis failed (${r.status})`);
      setBible(data.bible);
    } catch {
      setBible(analyzeStory(text)); // offline: the same rule-based analysis runs in the browser
    } finally {
      setBusy(false);
      setRun(null);
      setStep(1);
    }
  }

  const refFor = useCallback((scene: SceneInput) => {
    const full = scenes.find((x) => x.id === scene.id);
    const named = bible?.characters.filter((c) => c.imageUrl) ?? [];
    return (full?.characters.map((n) => named.find((c) => c.name === n)).find(Boolean) ?? named[0])?.imageUrl;
  }, [scenes, bible]);

  async function start() {
    if (!inputs.length || running) return;
    const ctl = new AbortController();
    abort.current = ctl;
    const saved = usableSaved(persisted.current, inputs);
    setError('');
    await runProduction({
      scenes: inputs, api: makeApi(engine), saved, signal: ctl.signal, referenceFor: refFor,
      onState: (st) => {
        setRun(st);
        const keep: Persisted['saved'] = {};
        st.scenes.forEach((x, i) => { if (x.status === 'done' && x.clipUrl) keep[x.id] = { key: hashScene(inputs[i]!), clipUrl: x.clipUrl, lastFrameUrl: x.lastFrameUrl }; });
        remember({ saved: keep });
      },
    });
  }

  function exportPlan() {
    if (!bible) return;
    const plan = buildPlan(bible.title, scenes, (sc) => refFor({ id: sc.id, prompt: sc.prompt, duration: sc.duration, continuity: sc.continuity }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'story-studio.plan.json' });
    a.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    abort.current?.abort();
    setRun(null);
    remember({ saved: {} });
  }

  const stage = (() => {
    switch (view.phase) {
      case 'running': { const i = Math.max(0, view.scenes.findIndex((x) => x.status === 'generating')); return fill(s.sceneOf, { n: i + 1, t: view.scenes.length }); }
      case 'joining': return s.joining;
      case 'done': return s.done;
      case 'failed': return s.failed;
      case 'stopped': return s.stopped;
      default: return view.scenes.some((x) => x.status === 'done') ? `${view.scenes.filter((x) => x.status === 'done').length}/${view.scenes.length}` : s.idle;
    }
  })();

  const picked = view.scenes.find((x) => x.id === selectedId && x.clipUrl);
  const latest = [...view.scenes].reverse().find((x) => x.clipUrl);
  const preview = playable((picked ?? latest)?.clipUrl);
  const eta = etaSeconds(view, now);
  const doneCount = view.scenes.filter((x) => x.status === 'done').length;
  const allScenesDone = view.scenes.length > 0 && doneCount === view.scenes.length;
  const finalSrc = playable(view.finalUrl);
  const selectedScene = scenes.find((x) => x.id === selectedId);
  const steps = [s.step1, s.step2, s.step3, s.step4];
  const reach = (n: StepId) => (n === 0 ? true : !!bible);

  const reel = (
    <ProgressReel state={view} previewUrl={preview} selectedId={selectedId} onSelect={setSelectedId} stage={stage} sceneWord={lang === 'ar' ? 'مشهد' : 'Scene'}
      statusLabels={{ queued: s.status_queued, generating: s.status_generating, done: s.status_done, failed: s.status_failed }} />
  );

  return (
    <div className="st-root" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
      <header className="st-top">
        <div className="st-brand"><span className="st-logo" aria-hidden="true" /><div><b>{s.brand}</b><small>{s.tagline}</small></div></div>
        <nav className="st-nav">
          <Link href="/">{s.old}</Link>
          <button type="button" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{s.langSwitch}</button>
        </nav>
      </header>

      <ol className="st-rail" aria-label="Steps">
        {steps.map((label, i) => (
          <li key={label}>
            <button type="button" disabled={!reach(i as StepId)} aria-current={step === i ? 'step' : undefined} className={step === i ? 'is-on' : i < step ? 'is-past' : ''} onClick={() => setStep(i as StepId)}>
              <span>{i + 1}</span>{label}
            </button>
          </li>
        ))}
      </ol>

      {error && <p className="st-error" role="alert">{error}</p>}

      <main className={'st-main' + (step >= 2 ? ' with-reel' : '')}>
        <div className="st-pane">
          {step === 0 && (
            <section className="st-glass">
              <label className="st-field" htmlFor="st-story"><span>{s.storyLabel}</span></label>
              <textarea id="st-story" className="st-story" value={text} onChange={(e) => setText(e.target.value)} placeholder={s.storyPh} rows={9} />
              <TimeDial total={total} onChange={setTotal} s={s} />
              <button type="button" className="st-cta" onClick={analyze} disabled={busy}>{busy ? s.analyzing : s.analyze}</button>
            </section>
          )}

          {step === 1 && bible && (
            <>
              <section className="st-glass">
                <div className="st-board-head"><h2>{s.detected}</h2><span className="st-badge">{bible.analysis === 'llm' ? s.byLlm : s.byRules}</span></div>
                <p className="st-hint">{s.edit}</p>
                <div className="st-grid2">
                  <label>{s.title}<input value={bible.title} onChange={(e) => setBible({ ...bible, title: e.target.value })} /></label>
                  <label>{s.setting}<input value={bible.setting} onChange={(e) => setBible({ ...bible, setting: e.target.value })} /></label>
                  <label>{s.tone}<input value={bible.tone} onChange={(e) => setBible({ ...bible, tone: e.target.value })} /></label>
                  <label>{s.message}<input value={bible.message} onChange={(e) => setBible({ ...bible, message: e.target.value })} /></label>
                </div>
                <TimeDial total={total} onChange={setTotal} s={s} />
              </section>
              <section className="st-glass"><CastPanel characters={bible.characters} onChange={(characters) => setBible({ ...bible, characters })} s={s} /></section>
              <button type="button" className="st-cta" onClick={() => setStep(2)}>{s.step3} →</button>
            </>
          )}

          {step === 2 && bible && (
            <>
              <section className="st-glass"><Storyboard scenes={scenes} runs={view.scenes} selectedId={selectedId} onSelect={setSelectedId} s={s} /></section>
              {selectedScene && <section className="st-glass"><h3>{s.selected} {selectedScene.index + 1}</h3><p className="st-hint">{s.prompt}</p><pre className="st-prompt" dir="ltr">{selectedScene.prompt}</pre></section>}
              <button type="button" className="st-cta" onClick={() => setStep(3)}>{s.step4} →</button>
            </>
          )}

          {step === 3 && bible && (
            <section className="st-glass">
              <div className="st-stats">
                <div><small>{s.produced}</small><b>{formatClock(producedSeconds(view.scenes))}</b></div>
                <div><small>{s.remaining}</small><b>{formatClock(Math.max(0, total - producedSeconds(view.scenes)))}</b></div>
                <div><small>{s.eta}</small><b>{eta === undefined ? '—' : formatClock(eta)}</b></div>
                <div><small>{s.total}</small><b>{formatClock(total)}</b></div>
              </div>
              <label className="st-engine">{s.engine}
                <select value={engine} onChange={(e) => setEngine(e.target.value as Engine)} disabled={running}>
                  <option value="auto">{s.engine_auto}</option>
                  <option value="hf">{s.engine_hf}</option>
                  <option value="ltx">{s.engine_ltx}</option>
                </select>
              </label>
              <div className="st-actions">
                {running
                  ? <button type="button" className="st-cta is-stop" onClick={() => abort.current?.abort()}>{s.stop}</button>
                  : <button type="button" className="st-cta" onClick={start} disabled={!inputs.length || view.phase === 'done'}>{view.phase === 'failed' && allScenesDone ? s.retryJoin : doneCount > 0 && view.phase !== 'done' ? s.resume : s.produce}</button>}
                {(doneCount > 0 || run) && !running && <button type="button" className="st-ghost" onClick={reset}>{s.reset}</button>}
              </div>
              <div className="st-export"><button type="button" className="st-ghost" onClick={exportPlan} disabled={!scenes.length}>⤓ {s.exportPlan}</button><p className="st-hint">{s.exportHint}</p></div>
              {view.error && <p className="st-error" role="alert">{view.error}</p>}
              <p className="st-hint">{s.gpuNote}</p>
              {finalSrc && (
                <div className="st-final">
                  <h3>{s.finalVideo}</h3>
                  <video src={finalSrc} controls playsInline preload="metadata" />
                  <a className="st-ghost" href={finalSrc} download>{s.download}</a>
                </div>
              )}
            </section>
          )}
        </div>

        {step >= 2 && <aside className={'st-side' + (step === 3 ? ' is-hero' : '')}>{reel}</aside>}
      </main>
    </div>
  );
}
