'use client';
// Character Bible: canonical, server-side characters with durable reference images, a locked
// voice, and an identity lock that must be released explicitly before identity fields change.
import {useState} from 'react';
import type {Character, MediaRef} from '@/lib/types';
import {api, downscaleImage, errorText} from '@/lib/client';

type Draft = Partial<Character> & {name: string; appearance: string};
const FIELDS: [keyof Character, string, boolean][] = [
  ['role', 'Role', false], ['age', 'Age', false], ['build', 'Body / build', false], ['hair', 'Hair', false],
  ['appearance', 'Fixed appearance: face, skin, features…', true], ['wardrobe', 'Wardrobe rules', true],
  ['personality', 'Personality', true], ['relationships', 'Relationships', true], ['negativeConstraints', 'Never show (negative constraints)', true],
];

function CharacterForm({seriesId, initial, onSaved, onCancel}: {seriesId: string; initial?: Character; onSaved: () => void; onCancel?: () => void}) {
  const [d, setD] = useState<Draft>(initial || {name: '', appearance: ''});
  const [voiceId, setVoiceId] = useState(initial?.voice?.voiceId || '');
  const [voiceProvider, setVoiceProvider] = useState(initial?.voice?.provider || 'tts');
  const [style, setStyle] = useState(initial?.voice?.speakingStyle || '');
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [warning, setWarning] = useState('');
  const set = (k: keyof Character, v: string) => setD(x => ({...x, [k]: v}));

  async function upload(file: File) {
    setBusy('Uploading…'); setError('');
    try {
      const form = new FormData();
      form.set('file', await downscaleImage(file), 'reference.jpg');
      const ref = await api<MediaRef & {warning?: string}>('/api/media', {method: 'POST', body: form});
      setD(x => ({...x, referenceImage: {url: ref.url, key: ref.key, durable: ref.durable, contentType: ref.contentType}}));
      setWarning(ref.warning || '');
    } catch (e) {setError(errorText(e));} finally {setBusy('');}
  }
  async function importUrl() {
    setBusy('Importing…'); setError('');
    try {
      const ref = await api<MediaRef & {warning?: string}>('/api/media', {method: 'POST', json: {url: imageUrl.trim()}});
      setD(x => ({...x, referenceImage: {url: ref.url, key: ref.key, durable: ref.durable, contentType: ref.contentType}}));
      setWarning(ref.warning || ''); setImageUrl('');
    } catch (e) {setError(errorText(e));} finally {setBusy('');}
  }
  async function save() {
    setBusy('Saving…'); setError('');
    const clean = Object.fromEntries(Object.entries(d).filter(([k, v]) => !['id', 'seriesId', 'locked', 'lockedAt', 'createdAt', 'updatedAt'].includes(k) && v !== '' && v !== undefined));
    const body = {...clean, ...(initial ? {referenceImage: d.referenceImage ?? null} : {}), voice: voiceId.trim() ? {provider: voiceProvider.trim() || 'tts', voiceId: voiceId.trim(), ...(style.trim() ? {speakingStyle: style.trim()} : {})} : (initial ? null : undefined)};
    try {
      if (initial) await api(`/api/series/${seriesId}/characters/${initial.id}`, {method: 'PATCH', json: body});
      else await api(`/api/series/${seriesId}/characters`, {method: 'POST', json: body});
      onSaved();
    } catch (e) {setError(errorText(e));} finally {setBusy('');}
  }

  return <div className="mt-3 grid gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-2">
    <input dir="auto" className="field p-2" placeholder="Character name" value={d.name} onChange={e => set('name', e.target.value)}/>
    {FIELDS.map(([k, label, wide]) => wide
      ? <textarea key={k} dir="auto" className="field p-2 sm:col-span-2" placeholder={label} value={(d[k] as string) || ''} onChange={e => set(k, e.target.value)}/>
      : <input key={k} dir="auto" className="field p-2" placeholder={label} value={(d[k] as string) || ''} onChange={e => set(k, e.target.value)}/>)}
    <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3">
      <input className="field p-2" placeholder="Voice provider (tts)" value={voiceProvider} onChange={e => setVoiceProvider(e.target.value)}/>
      <input className="field p-2" placeholder="Voice ID (locked per character)" value={voiceId} onChange={e => setVoiceId(e.target.value)}/>
      <input dir="auto" className="field p-2" placeholder="Speaking style" value={style} onChange={e => setStyle(e.target.value)}/>
    </div>
    <div className="sm:col-span-2">
      <label className="mb-1 block text-xs text-slate-500">Reference image (same actor / character), saved to durable storage</label>
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" accept="image/*" className="text-sm" onChange={e => {const f = e.target.files?.[0]; if (f) upload(f);}}/>
        <input className="field flex-1 p-2" placeholder="…or import from a public https image URL" value={imageUrl} onChange={e => setImageUrl(e.target.value)}/>
        <button className="btn ghost" disabled={!imageUrl.trim() || !!busy} onClick={importUrl}>Import</button>
      </div>
      {d.referenceImage && <div className="mt-2 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={d.referenceImage.url} alt={d.name || 'Reference'} className="h-20 w-20 rounded-xl object-cover"/>
        <span className={'text-xs ' + (d.referenceImage.durable ? 'text-emerald-400' : 'text-amber-300')}>{d.referenceImage.durable ? 'Saved to durable storage ✓' : 'Saved locally (development only)'}</span>
        <button className="text-xs text-slate-500 hover:text-white" onClick={() => setD(x => ({...x, referenceImage: undefined}))}>Remove</button>
      </div>}
      {warning && <p className="mt-1 text-xs text-amber-300">{warning}</p>}
    </div>
    <div className="flex items-center gap-3 sm:col-span-2">
      <button className="btn primary disabled:opacity-40" disabled={!!busy || !d.name.trim() || !d.appearance.trim()} onClick={save}>{busy || (initial ? 'Save character' : 'Add character')}</button>
      {onCancel && <button className="btn ghost" onClick={onCancel}>Cancel</button>}
      {error && <span className="text-sm text-red-300">{error}</span>}
    </div>
  </div>;
}

export default function CharacterBible({seriesId, characters, onChange}: {seriesId: string; characters: Character[]; onChange: () => void}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  async function lock(c: Character, locked: boolean) {
    setError('');
    try {await api(`/api/series/${seriesId}/characters/${c.id}/lock`, {method: 'POST', json: {locked}}); onChange();}
    catch (e) {setError(errorText(e));}
  }
  async function remove(c: Character) {
    if (!confirm(`Delete ${c.name}?`)) return;
    try {await api(`/api/series/${seriesId}/characters/${c.id}`, {method: 'DELETE'}); onChange();} catch (e) {setError(errorText(e));}
  }
  return <div className="mt-5 rounded-xl border border-white/10 p-4">
    <div className="flex items-center justify-between"><b className="text-sm">Character Bible · {characters.length} canonical character{characters.length === 1 ? '' : 's'}</b>
      {!adding && <button className="btn ghost" onClick={() => setAdding(true)}>+ Add character</button>}</div>
    {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    {adding && <CharacterForm seriesId={seriesId} onSaved={() => {setAdding(false); onChange();}} onCancel={() => setAdding(false)}/>}
    {characters.map(c => editing === c.id
      ? <CharacterForm key={c.id} seriesId={seriesId} initial={c} onSaved={() => {setEditing(null); onChange();}} onCancel={() => setEditing(null)}/>
      : <div key={c.id} className="mt-3 flex gap-3 rounded-xl border border-white/10 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {c.referenceImage ? <img src={c.referenceImage.url} alt={c.name} className="h-16 w-16 flex-none rounded-xl object-cover"/> : <div className="grid h-16 w-16 flex-none place-items-center rounded-xl bg-white/5 text-xs text-slate-500">no image</div>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><b dir="auto">{c.name}</b>{c.role && <span className="text-xs text-slate-500">{c.role}</span>}
            <span className={'rounded-lg border px-2 py-0.5 text-[11px] ' + (c.locked ? 'border-emerald-500/40 text-emerald-300' : 'border-white/10 text-slate-400')}>{c.locked ? '🔒 identity locked' : 'unlocked'}</span>
            {c.voice ? <span className="text-[11px] text-slate-400">voice {c.voice.provider}/{c.voice.voiceId}</span> : <span className="text-[11px] text-amber-300">no voice set</span>}</div>
          <p dir="auto" className="mt-1 line-clamp-2 text-xs text-slate-400">{[c.age, c.build, c.hair, c.appearance, c.wardrobe].filter(Boolean).join(' · ')}</p>
          <div className="mt-2 flex gap-3 text-xs">
            {c.locked
              ? <button className="text-amber-300" onClick={() => lock(c, false)}>Unlock to change identity</button>
              : <><button className="text-purple-300" onClick={() => setEditing(c.id)}>Edit</button><button className="text-emerald-300" onClick={() => lock(c, true)}>Lock identity</button><button className="text-red-400" onClick={() => remove(c)}>Delete</button></>}
          </div>
        </div>
      </div>)}
    {!characters.length && !adding && <p className="mt-2 text-xs text-slate-500">Add the recurring cast once. Locked characters are injected into every scene of every episode.</p>}
  </div>;
}
