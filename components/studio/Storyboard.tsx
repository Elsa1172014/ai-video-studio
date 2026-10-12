'use client';
import { formatClock } from '@/lib/planner';
import type { SceneRun } from '@/lib/runner';
import type { StoryScene } from '@/lib/story';
import type { StudioStrings } from '@/lib/studio-i18n';

export function Storyboard({ scenes, runs, selectedId, onSelect, s }: { scenes: StoryScene[]; runs?: SceneRun[]; selectedId?: string; onSelect: (id: string) => void; s: StudioStrings }) {
  const total = scenes.reduce((n, x) => n + x.duration, 0);
  return (
    <section aria-labelledby="st-board-h">
      <div className="st-board-head">
        <h2 id="st-board-h">{s.board}</h2>
        <span className="st-total">{s.total} <b>{formatClock(total)}</b> · {scenes.length}</span>
      </div>
      <ol className="st-strip">
        {scenes.map((sc, i) => {
          const status = runs?.[i]?.status ?? 'queued';
          return (
            <li key={sc.id}>
              <button type="button" className={`st-frame is-${status}` + (selectedId === sc.id ? ' is-selected' : '')} onClick={() => onSelect(sc.id)} aria-pressed={selectedId === sc.id}>
                <span className="st-frame-top"><b>{i + 1}</b><span className={`st-dot is-${status}`} aria-label={s[`status_${status}` as const]} /><time>{formatClock(sc.duration)}</time></span>
                <span className={`st-phase p-${sc.phase}`}>{s[`phase_${sc.phase}` as const]}</span>
                <span className="st-beat">{sc.beat}</span>
                <span className="st-who">{sc.characters.map((n) => <i key={n}>{n}</i>)}</span>
                <span className="st-cont">{sc.continuity === 'chain' ? '⛓ ' + s.chain : '✂ ' + s.fresh}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
