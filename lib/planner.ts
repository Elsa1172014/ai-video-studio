/**
 * Duration planning. Open video models produce short clips, so a long video is a chain of scenes.
 * Scene lengths stay within [SCENE_MIN, SCENE_MAX] and always add up to exactly the requested duration.
 */
export const SCENE_MIN = 3;
export const SCENE_MAX = 10;
export const SCENE_TARGET = 8;
export const MAX_TOTAL_SECONDS = 30 * 60;

export function clampTotal(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  return Math.max(0, Math.min(MAX_TOTAL_SECONDS, Math.round(seconds)));
}

/** `minutes` + `seconds` as typed by the user → total seconds (capped at 30 minutes). */
export const toSeconds = (minutes: number, seconds: number): number => clampTotal((Number(minutes) || 0) * 60 + (Number(seconds) || 0));

export function formatClock(total: number): string {
  const t = Math.max(0, Math.round(total));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** Scene lengths for a video of `total` seconds. Sum is exact; every scene is within the model's limits (a video shorter than SCENE_MIN is one scene). */
export function planDurations(total: number): number[] {
  const t = clampTotal(total);
  if (t <= 0) return [];
  if (t <= SCENE_MIN) return [t];
  const lo = Math.ceil(t / SCENE_MAX);
  const hi = Math.floor(t / SCENE_MIN);
  const count = Math.max(lo, Math.min(hi, Math.round(t / SCENE_TARGET)));
  const base = Math.floor(t / count);
  const extra = t - base * count;
  // Spread the remainder across the scenes evenly instead of lumping it at the start.
  return Array.from({ length: count }, (_, i) => base + (Math.floor(((i + 1) * extra) / count) - Math.floor((i * extra) / count)));
}
