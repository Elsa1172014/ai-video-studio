import type { Job, ProductionApi, Saved, SceneInput } from './runner';
import type { StoryBible } from './story';

async function safeRequest(url: string, init?: RequestInit): Promise<Job> {
  try {
    return await readJson(await fetch(url, init));
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown network error';
    return { status: 'failed', message: 'Generation service unreachable: ' + detail + '. Check /api/health and the GPU endpoint configuration.' };
  }
}

async function readJson(r: Response): Promise<Job> {
  const text = await r.text();
  try {
    const j = JSON.parse(text) as Job;
    return r.ok ? j : { status: 'failed', message: j.message || j.error || `Server answered ${r.status}` };
  } catch {
    return { status: 'failed', message: `Server returned ${r.status}: ${text.slice(0, 200) || 'empty response'}` };
  }
}

/** The real production API: the Next.js routes that talk to the GPU worker (Runpod or a Vast/Lightning HTTP worker). */
export type Engine = 'auto' | 'hf' | 'ltx';

export const makeApi = (provider: Engine): ProductionApi => ({
  ...httpApi,
  async generate(req) {
    return safeRequest('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, ...req }) });
  },
});

const httpApi: ProductionApi = {
  async generate(req) {
    return safeRequest('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'auto', ...req }) });
  },
  async status(jobId) {
    return safeRequest('/api/jobs/' + encodeURIComponent(jobId), { cache: 'no-store' });
  },
  async render(clips, durations) {
    return safeRequest('/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clips, durations }) });
  },
  wait: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/** Same-origin URL a browser can play for a worker output (the proxy adds the worker credentials server-side). */
export function playable(url: string | undefined): string | undefined {
  const name = url?.split('?')[0]?.split('/').pop();
  return name ? '/api/video/' + encodeURIComponent(name) : undefined;
}

// ---- Resume support: finished scenes survive a reload as long as the scene itself did not change. ----

const KEY = 'story-studio-v1';

export interface Persisted {
  text: string;
  minutes: number;
  seconds: number;
  lang: 'ar' | 'en';
  engine?: Engine;
  bible?: StoryBible;
  saved: Record<string, Saved & { key: string }>;
}

export function hashScene(s: Pick<SceneInput, 'prompt' | 'duration' | 'continuity'>): string {
  let h = 2166136261;
  const x = `${s.prompt}|${s.duration}|${s.continuity}`;
  for (let i = 0; i < x.length; i++) {
    h ^= x.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function loadPersisted(): Persisted | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Persisted) : undefined;
  } catch {
    return undefined;
  }
}

export function savePersisted(p: Persisted): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: progress simply is not remembered */
  }
}

/** Saved clips that still match the current scenes (same prompt, length and continuity). */
export function usableSaved(p: Persisted | undefined, scenes: SceneInput[]): Record<string, Saved> {
  const out: Record<string, Saved> = {};
  for (const s of scenes) {
    const hit = p?.saved[s.id];
    if (hit && hit.key === hashScene(s)) out[s.id] = { clipUrl: hit.clipUrl, lastFrameUrl: hit.lastFrameUrl };
  }
  return out;
}
