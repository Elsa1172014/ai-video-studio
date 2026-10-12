'use client';
import { arcPath, overallProgress, ringArcs } from '@/lib/progress';
import type { RunState } from '@/lib/runner';
import { formatClock } from '@/lib/planner';

const SIZE = 440;
const C = SIZE / 2;
const R_SEG = 186;
const R_ALL = 158;

/** Aurora colour along the ring: cyan at 12 o'clock to violet and magenta at the end. */
const hueAt = (frac: number) => 190 + frac * 130;

export interface ReelProps {
  state: RunState;
  /** Playable URL shown in the centre (latest finished scene or the selected one). */
  previewUrl?: string;
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** Text under the percentage, already translated. */
  stage: string;
  statusLabels: Record<'queued' | 'generating' | 'done' | 'failed', string>;
  sceneWord: string;
}

/**
 * The Reel: one arc per scene (length = the scene's share of the video), coloured by its real status, an inner
 * ring for overall progress and the newest finished clip playing in the centre. Percentages are produced seconds,
 * never an animation pretending to know how far a generation has got.
 */
export function ProgressReel({ state, previewUrl, selectedId, onSelect, stage, statusLabels, sceneWord }: ReelProps) {
  const arcs = ringArcs(state.scenes);
  const pct = Math.round(overallProgress(state) * 100);
  const running = state.phase === 'running' || state.phase === 'joining';
  const total = state.scenes.reduce((n, s) => n + s.duration, 0);
  return (
    <div className={'st-reel' + (running ? ' is-running' : '') + (state.phase === 'done' ? ' is-done' : '') + (state.phase === 'failed' ? ' is-failed' : '')}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${pct}% — ${stage}`} aria-label="Video production progress">
        <defs>
          <linearGradient id="st-all" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
        </defs>
        <circle className="st-ticks" cx={C} cy={C} r={208} />
        <circle className="st-track" cx={C} cy={C} r={R_ALL} />
        <circle className="st-all" cx={C} cy={C} r={R_ALL} pathLength={100} strokeDasharray={`${pct} 100`} transform={`rotate(-90 ${C} ${C})`} />
        {arcs.map((a, i) => {
          const scene = state.scenes[i]!;
          const d = arcPath(C, C, R_SEG, a.start, a.end);
          const mid = (a.start + a.end) / 2;
          const label = `${sceneWord} ${i + 1} · ${formatClock(scene.duration)} · ${statusLabels[a.status]}`;
          return (
            <g key={a.id} className={`st-arc is-${a.status}` + (selectedId === a.id ? ' is-selected' : '')} style={{ ['--hue' as string]: Math.round(hueAt(mid)) }}
              role="button" tabIndex={0} aria-label={label} onClick={() => onSelect?.(a.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect?.(a.id))}>
              <title>{label}</title>
              <path className="st-hit" d={d} />
              <path className="st-seg" d={d} />
              {a.status === 'generating' && <path className="st-pulse" d={d} />}
            </g>
          );
        })}
      </svg>
      <div className="st-core">
        {previewUrl ? <video key={previewUrl} src={previewUrl} muted loop autoPlay playsInline preload="metadata" aria-hidden="true" /> : <div className="st-core-bg" />}
        <div className="st-core-shade" />
        <div className="st-core-text">
          <strong className="st-pct">{pct}<small>%</small></strong>
          <span className="st-stage">{stage}</span>
          <span className="st-len">{formatClock(total)}</span>
        </div>
      </div>
    </div>
  );
}
