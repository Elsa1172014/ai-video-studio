/**
 * Production runner: generates scenes one after another on the GPU, chains each continuing scene from the previous
 * scene's last frame, retries a failed scene a bounded number of times, then joins everything into one video cut to
 * exactly the planned length. All I/O is injected so the logic is testable without a GPU.
 */
export type SceneStatus = 'queued' | 'generating' | 'done' | 'failed';
export type RunPhase = 'idle' | 'running' | 'joining' | 'done' | 'failed' | 'stopped';

export interface SceneInput {
  id: string;
  prompt: string;
  duration: number;
  continuity: 'chain' | 'fresh';
}

export interface SceneRun {
  id: string;
  duration: number;
  status: SceneStatus;
  attempt: number;
  clipUrl?: string;
  lastFrameUrl?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface RunState {
  scenes: SceneRun[];
  phase: RunPhase;
  finalUrl?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface Job {
  jobId?: string;
  status?: 'queued' | 'processing' | 'completed' | 'failed';
  outputUrl?: string;
  lastFrameUrl?: string;
  message?: string;
  error?: string;
}

export interface ProductionApi {
  generate(req: { prompt: string; duration: number; imageUrl?: string }): Promise<Job>;
  status(jobId: string): Promise<Job>;
  render(clips: string[], durations: number[]): Promise<Job>;
  wait(ms: number): Promise<void>;
}

export interface Saved {
  clipUrl: string;
  lastFrameUrl?: string;
}

export interface RunOptions {
  scenes: SceneInput[];
  api: ProductionApi;
  /** Character reference image for a scene that starts a new shot (no previous frame to continue from). */
  referenceFor?: (scene: SceneInput) => string | undefined;
  /** Scenes already produced in an earlier run (resume). */
  saved?: Record<string, Saved>;
  onState?: (s: RunState) => void;
  signal?: AbortSignal;
  maxAttempts?: number;
  pollMs?: number;
  /** Give up on one scene after this long. */
  sceneTimeoutMs?: number;
  now?: () => number;
}

export const initialState = (scenes: SceneInput[], saved: Record<string, Saved> = {}): RunState => ({
  phase: 'idle',
  scenes: scenes.map((s) => {
    const hit = saved[s.id];
    return { id: s.id, duration: s.duration, attempt: 0, status: hit ? 'done' : 'queued', clipUrl: hit?.clipUrl, lastFrameUrl: hit?.lastFrameUrl };
  }),
});

class Stopped extends Error {}

export async function runProduction(o: RunOptions): Promise<RunState> {
  const { api, scenes, signal } = o;
  const now = o.now ?? Date.now;
  const maxAttempts = o.maxAttempts ?? 2;
  const pollMs = o.pollMs ?? 3000;
  const sceneTimeoutMs = o.sceneTimeoutMs ?? 15 * 60_000;
  let state: RunState = { ...initialState(scenes, o.saved), phase: 'running', startedAt: now() };
  const emit = (patch: Partial<RunState>, scene?: { i: number; patch: Partial<SceneRun> }) => {
    state = { ...state, ...patch, scenes: scene ? state.scenes.map((s, i) => (i === scene.i ? { ...s, ...scene.patch } : s)) : state.scenes };
    o.onState?.(state);
  };
  const check = () => {
    if (signal?.aborted) throw new Stopped();
  };
  const settle = async (first: Job): Promise<Job> => {
    let job = first;
    const deadline = now() + sceneTimeoutMs;
    while (job.status === 'queued' || job.status === 'processing') {
      if (!job.jobId) return { status: 'failed', message: 'The server returned no job id' };
      check();
      if (now() > deadline) return { status: 'failed', message: 'Timed out waiting for the GPU' };
      await api.wait(pollMs);
      check();
      job = await api.status(job.jobId);
    }
    return job;
  };
  emit({});
  try {
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]!;
      if (state.scenes[i]!.status === 'done') continue;
      const prevFrame = i > 0 ? state.scenes[i - 1]!.lastFrameUrl : undefined;
      const imageUrl = scene.continuity === 'chain' && prevFrame ? prevFrame : o.referenceFor?.(scene);
      let lastError = '';
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        check();
        emit({}, { i, patch: { status: 'generating', attempt, startedAt: now(), error: undefined } });
        try {
          const job = await settle(await api.generate({ prompt: scene.prompt, duration: scene.duration, ...(imageUrl ? { imageUrl } : {}) }));
          if (job.status === 'completed' && job.outputUrl) {
            emit({}, { i, patch: { status: 'done', clipUrl: job.outputUrl, lastFrameUrl: job.lastFrameUrl, finishedAt: now() } });
            lastError = '';
            break;
          }
          lastError = job.message || job.error || 'Scene generation failed';
        } catch (e) {
          if (e instanceof Stopped) throw e;
          lastError = (e as Error).message || 'Scene generation failed';
        }
        if (attempt < maxAttempts) await api.wait(2000 * attempt);
      }
      if (lastError) {
        emit({ phase: 'failed', error: `${scenes[i]!.id}: ${lastError}`, finishedAt: now() }, { i, patch: { status: 'failed', error: lastError, finishedAt: now() } });
        return state;
      }
    }
    check();
    emit({ phase: 'joining' });
    const clips = state.scenes.map((s) => s.clipUrl!);
    const durations = scenes.map((s) => s.duration);
    const job = await settle(await api.render(clips, durations));
    if (job.status === 'completed' && job.outputUrl) emit({ phase: 'done', finalUrl: job.outputUrl, finishedAt: now() });
    else emit({ phase: 'failed', error: job.message || job.error || 'Joining the scenes failed', finishedAt: now() });
  } catch (e) {
    if (e instanceof Stopped) emit({ phase: 'stopped', finishedAt: now() }, undefined);
    else emit({ phase: 'failed', error: (e as Error).message, finishedAt: now() });
  }
  return state;
}
