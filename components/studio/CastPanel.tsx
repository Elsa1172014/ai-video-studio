'use client';
import { idOf, type Character } from '@/lib/story';
import type { StudioStrings } from '@/lib/studio-i18n';

const hue = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

function Portrait({ c }: { c: Character }) {
  return c.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="st-portrait" src={c.imageUrl} alt={c.name} referrerPolicy="no-referrer" />
  ) : (
    <span className="st-portrait is-letter" style={{ ['--h' as string]: hue(c.name) }} aria-hidden="true">{[...c.name][0] ?? '?'}</span>
  );
}

export function CastPanel({ characters, onChange, s }: { characters: Character[]; onChange: (next: Character[]) => void; s: StudioStrings }) {
  const patch = (i: number, p: Partial<Character>) => onChange(characters.map((c, k) => (k === i ? { ...c, ...p } : c)));
  return (
    <section aria-labelledby="st-cast-h">
      <h2 id="st-cast-h">{s.cast}</h2>
      <p className="st-hint">{s.castHint}</p>
      {characters.length === 0 && <p className="st-empty">{s.noCast}</p>}
      <div className="st-cast">
        {characters.map((c, i) => (
          <article className="st-char" key={c.id + i}>
            <Portrait c={c} />
            <div className="st-char-body">
              <label>{s.name}<input value={c.name} onChange={(e) => patch(i, { name: e.target.value, id: idOf(e.target.value) })} /></label>
              <label>{s.desc}<textarea rows={3} value={c.description} onChange={(e) => patch(i, { description: e.target.value })} /></label>
              <label>{s.refImage}<input dir="ltr" inputMode="url" placeholder="https://…/face.jpg" value={c.imageUrl ?? ''} onChange={(e) => patch(i, { imageUrl: e.target.value.trim() || undefined })} /></label>
              <div className="st-char-foot">
                <span className="st-soon" title={s.avatarSoon}>◔ {s.avatar} · {s.avatarSoon}</span>
                <button type="button" className="st-link" onClick={() => onChange(characters.filter((_, k) => k !== i))}>{s.remove}</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <button type="button" className="st-ghost" onClick={() => onChange([...characters, { id: `character-${characters.length + 1}`, name: '', description: '' }])}>＋ {s.addCharacter}</button>
    </section>
  );
}
