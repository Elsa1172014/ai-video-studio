'use client';
import type {Scene} from '@/lib/project-store';

const fmt=(s:number)=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.round(s%60)).padStart(2,'0')}`;

/** Scene track sized by real duration, with the caption track that the finish burns in. */
export default function Timeline({scenes,selected,onSelect}:{scenes:Scene[];selected?:number;onSelect?:(i:number)=>void}){
  const total=scenes.reduce((n,s)=>n+s.duration,0)||1;
  if(!scenes.length)return <div className="mt-6 rounded-xl border border-dashed border-white/15 p-6 text-sm text-slate-400">No scenes yet. Build a storyboard from the Director page.</div>;
  return (
    <div className="mt-6">
      <div className="mb-2 flex justify-between text-xs text-slate-500"><span>00:00</span><span>Timeline · {scenes.length} scenes</span><span>{fmt(total)}</span></div>
      <div className="space-y-2 overflow-x-auto">
        <div className="flex h-16 min-w-[560px] gap-1 rounded-xl bg-black/25 p-2">
          {scenes.map((s,i)=>(
            <button type="button" key={s.id} onClick={()=>onSelect?.(i)} style={{flexGrow:s.duration,flexBasis:0}} title={s.title}
              className={'min-w-0 rounded-lg border p-2 text-left text-xs transition '+(selected===i?'border-purple-400 bg-purple-500/25':'border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20')}>
              <b className="block truncate">{i+1}. {s.title}</b><span className="text-slate-400">{s.duration}s</span>
            </button>
          ))}
        </div>
        <div className="flex h-10 min-w-[560px] gap-1 rounded-xl border border-white/10 bg-white/5 p-1.5">
          {scenes.map(s=><div key={s.id} dir="auto" style={{flexGrow:s.duration,flexBasis:0}} className="min-w-0 truncate rounded bg-amber-400/10 px-2 py-1 text-[11px] text-amber-200/80">{s.sourceText||'—'}</div>)}
        </div>
      </div>
    </div>
  );
}
