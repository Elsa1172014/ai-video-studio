'use client';
// Storyboard review and per-scene editing. Saving a scene regenerates only that scene's shots.
import {useState} from 'react';
import type {Character, OwnerKind, Scene, Storyboard as Board} from '@/lib/types';
import {api, errorText} from '@/lib/client';

function SceneEditor({scene, characters, onSave, onCancel}: {scene: Scene; characters: Character[]; onSave: (patch: Partial<Scene>) => Promise<void>; onCancel: () => void}) {
  const [narration, setNarration] = useState(scene.narration);
  const [visual, setVisual] = useState(scene.visual);
  const [duration, setDuration] = useState(scene.duration);
  const [dialogue, setDialogue] = useState(scene.dialogue.map(d => `${d.speaker}: ${d.text}`).join('\n'));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const lines = dialogue.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [speaker, ...rest] = l.split(':');
      const c = characters.find(x => x.name.toLowerCase() === speaker.trim().toLowerCase());
      return {speaker: speaker.trim(), speakerId: c?.id, text: rest.join(':').trim()};
    }).filter(d => d.text);
    try {await onSave({narration, visual, duration, ...(characters.length ? {dialogue: lines} : {})});} finally {setBusy(false);}
  }
  return <div className="mt-3 space-y-2">
    <label className="block text-xs text-slate-500">Narration (voice-over)</label>
    <textarea dir="auto" className="field min-h-20" value={narration} onChange={e => setNarration(e.target.value)}/>
    {characters.length > 0 && <><label className="block text-xs text-slate-500">Dialogue · one line per speaker, “Name: line”</label>
      <textarea dir="auto" className="field min-h-20" value={dialogue} onChange={e => setDialogue(e.target.value)}/></>}
    <label className="block text-xs text-slate-500">Visual direction</label>
    <textarea dir="auto" className="field min-h-20" value={visual} onChange={e => setVisual(e.target.value)}/>
    <div className="flex items-center gap-3">
      <label className="text-xs text-slate-500">Duration (s)</label>
      <input type="number" min={5} max={120} className="field w-24 p-2" value={duration} onChange={e => setDuration(Number(e.target.value))}/>
      <button onClick={save} disabled={busy} className="btn primary disabled:opacity-40">{busy ? 'Saving…' : 'Save scene'}</button>
      <button onClick={onCancel} className="btn ghost">Cancel</button>
    </div>
    <p className="text-xs text-slate-500">Saving replaces this scene’s clips and voice track; other scenes keep theirs.</p>
  </div>;
}

export default function Storyboard({kind, id, board, characters = [], onChange}: {kind: OwnerKind; id: string; board: Board; characters?: Character[]; onChange: () => void}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const total = board.scenes.reduce((n, s) => n + s.duration, 0);
  const names = (s: Scene) => characters.filter(c => s.characterIds.includes(c.id)).map(c => c.name);
  async function save(scene: Scene, patch: Partial<Scene>) {
    setError('');
    try {await api(`/api/productions/${kind}/${id}/scenes/${scene.id}`, {method: 'PATCH', json: patch}); setEditing(null); onChange();}
    catch (e) {setError(errorText(e));}
  }
  return <div className="card mt-5 p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-xs text-purple-400">{kind === 'episode' ? 'EPISODE STORYBOARD' : 'LEARNING STORYBOARD'}</p>
        <h2 className="text-xl font-bold">{board.scenes.length} scenes · {Math.floor(total / 60)}:{String(total % 60).padStart(2, '0')} min</h2></div>
      <span className="text-xs text-slate-500">{board.planner === 'llm' ? 'AI director' : 'Deterministic director'} · ~{board.narrationSeconds}s of speech</span>
    </div>
    {board.warnings.map(w => <p key={w} className="mt-2 text-xs text-amber-300">{w}</p>)}
    {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    <div className="mt-4 grid gap-3">
      {board.scenes.map(s => <div key={s.id} className="rounded-xl border border-white/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div><b>{s.index + 1}. {s.title}</b><p className="mt-1 text-xs text-slate-500">{s.duration}s · {s.shots.length} shot{s.shots.length === 1 ? '' : 's'}{s.phase ? ` · ${s.phase}` : ''}{names(s).length ? ` · ${names(s).join(', ')}` : ''}{s.referenceImageUrl ? ' · reference image' : ''}</p></div>
          {editing !== s.id && <button className="text-xs text-purple-300" onClick={() => setEditing(s.id)}>Edit</button>}
        </div>
        {editing === s.id ? <SceneEditor scene={s} characters={characters} onSave={p => save(s, p)} onCancel={() => setEditing(null)}/> : <>
          {s.narration && <p dir="auto" className="mt-2 text-sm text-slate-300">{s.narration}</p>}
          {s.dialogue.map((d, k) => <p key={k} dir="auto" className="mt-1 text-sm"><span className="text-purple-300">{d.speaker}:</span> {d.text}</p>)}
          {s.visual && s.visual !== s.narration && <p dir="auto" className="mt-2 text-xs text-slate-500">Visual: {s.visual}</p>}
        </>}
      </div>)}
    </div>
  </div>;
}
