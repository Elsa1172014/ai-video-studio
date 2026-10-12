import type { RunState, SceneRun } from './runner';

/** Share of the bar reserved for the final join, so 100% means the finished video exists, not just the last scene. */
export const JOIN_SHARE = 0.05;

const totalSeconds = (scenes: SceneRun[]) => scenes.reduce((n, s) => n + s.duration, 0);
export const producedSeconds = (scenes: SceneRun[]) => scenes.filter((s) => s.status === 'done').reduce((n, s) => n + s.duration, 0);

/** Honest overall progress in [0,1]: seconds of video actually produced, plus the join step. No fake in-between percentages. */
export function overallProgress(state: RunState): number {
  const total = totalSeconds(state.scenes);
  if (!total) return 0;
  if (state.phase === 'done') return 1;
  return Math.min(1, (producedSeconds(state.scenes) / total) * (1 - JOIN_SHARE));
}

/** Estimated seconds left, from how long finished scenes took per second of video. Undefined until one scene has finished. */
export function etaSeconds(state: RunState, now: number): number | undefined {
  const done = state.scenes.filter((s) => s.status === 'done' && s.startedAt !== undefined && s.finishedAt !== undefined);
  if (!done.length || state.phase === 'done') return state.phase === 'done' ? 0 : undefined;
  const wall = done.reduce((n, s) => n + (s.finishedAt! - s.startedAt!), 0) / 1000;
  const videoSeconds = done.reduce((n, s) => n + s.duration, 0);
  const perSecond = wall / videoSeconds;
  const remaining = totalSeconds(state.scenes) - producedSeconds(state.scenes);
  const active = state.scenes.find((s) => s.status === 'generating');
  const spent = active?.startedAt !== undefined ? Math.max(0, (now - active.startedAt) / 1000) : 0;
  return Math.max(0, Math.round(remaining * perSecond - spent + 10));
}

export interface Arc {
  id: string;
  start: number;
  end: number;
  status: SceneRun['status'];
}

/** One arc per scene, each as long as the scene's share of the video, separated by a thin gap. Fractions of a full turn. */
export function ringArcs(scenes: SceneRun[], gap = 0.004): Arc[] {
  const total = totalSeconds(scenes);
  if (!total) return [];
  const g = scenes.length > 1 ? Math.min(gap, 0.5 / scenes.length) : 0;
  let at = 0;
  return scenes.map((s) => {
    const span = s.duration / total;
    const arc = { id: s.id, start: at + g / 2, end: Math.max(at + g / 2 + 0.0005, at + span - g / 2), status: s.status };
    at += span;
    return arc;
  });
}

const rad = (frac: number) => (frac * 360 - 90) * (Math.PI / 180); // 0 = 12 o'clock, clockwise

/** SVG path for an arc between two fractions of a full turn. */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const span = Math.min(Math.max(to - from, 0), 0.9999);
  const a = rad(from);
  const b = rad(from + span);
  const x1 = cx + r * Math.cos(a);
  const y1 = cy + r * Math.sin(a);
  const x2 = cx + r * Math.cos(b);
  const y2 = cy + r * Math.sin(b);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${span > 0.5 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
