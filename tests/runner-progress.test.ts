import { describe, expect, it } from 'vitest';
import { arcPath, etaSeconds, overallProgress, ringArcs } from '@/lib/progress';
import { initialState, runProduction, type Job, type ProductionApi, type SceneInput } from '@/lib/runner';

const scenes = (n: number, d = 8): SceneInput[] => Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, prompt: `p${i + 1}`, duration: d, continuity: i % 2 ? 'chain' : 'fresh' }));

function fakeApi(over: Partial<ProductionApi> & { failures?: Record<string, number> } = {}) {
  const calls: { generate: { prompt: string; duration: number; imageUrl?: string }[]; render: { clips: string[]; durations: number[] }[]; waits: number[] } = { generate: [], render: [], waits: [] };
  const failures = { ...over.failures };
  const jobs = new Map<string, Job>();
  const api: ProductionApi = {
    async generate(req) {
      calls.generate.push(req);
      if ((failures[req.prompt] ?? 0) > 0) { failures[req.prompt]!--; throw new Error('GPU busy'); }
      const id = `j${calls.generate.length}`;
      jobs.set(id, { jobId: id, status: 'completed', outputUrl: `https://gpu/${req.prompt}.mp4`, lastFrameUrl: `https://gpu/${req.prompt}.jpg` });
      return { jobId: id, status: 'queued' };
    },
    async status(id) { return jobs.get(id)!; },
    async render(clips, durations) { calls.render.push({ clips, durations }); return { jobId: 'r', status: 'completed', outputUrl: 'https://gpu/final.mp4' }; },
    async wait(ms) { calls.waits.push(ms); },
    ...over,
  };
  return { api, calls };
}

describe('runProduction', () => {
  it('produces every scene in order, then joins with the planned durations', async () => {
    const { api, calls } = fakeApi();
    const states: string[] = [];
    const end = await runProduction({ scenes: scenes(3), api, onState: (s) => states.push(s.phase) });
    expect(end.phase).toBe('done');
    expect(end.finalUrl).toBe('https://gpu/final.mp4');
    expect(calls.generate.map((g) => g.prompt)).toEqual(['p1', 'p2', 'p3']);
    expect(calls.render[0]).toEqual({ clips: ['https://gpu/p1.mp4', 'https://gpu/p2.mp4', 'https://gpu/p3.mp4'], durations: [8, 8, 8] });
    expect(states).toContain('joining');
    expect(end.scenes.every((s) => s.status === 'done')).toBe(true);
  });

  it('chain scenes start from the previous last frame; fresh scenes use the character reference', async () => {
    const { api, calls } = fakeApi();
    await runProduction({ scenes: scenes(3), api, referenceFor: () => 'https://ref/omar.jpg' });
    expect(calls.generate[0]!.imageUrl).toBe('https://ref/omar.jpg'); // s1 fresh
    expect(calls.generate[1]!.imageUrl).toBe('https://gpu/p1.jpg'); // s2 chain
    expect(calls.generate[2]!.imageUrl).toBe('https://ref/omar.jpg'); // s3 fresh
  });

  it('a chained scene without a previous frame falls back to the reference, and sends no image when there is none', async () => {
    const { api, calls } = fakeApi();
    await runProduction({ scenes: scenes(2).map((s) => ({ ...s, continuity: 'chain' as const })), api });
    expect(calls.generate[0]!.imageUrl).toBeUndefined();
    expect(calls.generate[1]!.imageUrl).toBe('https://gpu/p1.jpg');
  });

  it('retries a failing scene a bounded number of times, then stops with the reason and keeps finished scenes', async () => {
    const { api, calls } = fakeApi({ failures: { p2: 5 } });
    const end = await runProduction({ scenes: scenes(3), api, maxAttempts: 2 });
    expect(end.phase).toBe('failed');
    expect(end.error).toContain('s2');
    expect(end.scenes.map((s) => s.status)).toEqual(['done', 'failed', 'queued']);
    expect(calls.generate.filter((g) => g.prompt === 'p2')).toHaveLength(2); // never an endless loop
    expect(calls.render).toHaveLength(0);
  });

  it('recovers when a retry succeeds', async () => {
    const { api } = fakeApi({ failures: { p2: 1 } });
    const end = await runProduction({ scenes: scenes(3), api, maxAttempts: 2 });
    expect(end.phase).toBe('done');
    expect(end.scenes[1]!.attempt).toBe(2);
  });

  it('resumes: saved scenes are not generated again', async () => {
    const { api, calls } = fakeApi();
    const end = await runProduction({ scenes: scenes(3), api, saved: { s1: { clipUrl: 'https://gpu/p1.mp4', lastFrameUrl: 'https://gpu/p1.jpg' } } });
    expect(calls.generate.map((g) => g.prompt)).toEqual(['p2', 'p3']);
    expect(calls.generate[0]!.imageUrl).toBe('https://gpu/p1.jpg'); // s2 chains from the saved frame
    expect(end.phase).toBe('done');
  });

  it('a stop request ends the run cleanly between polls', async () => {
    const ctl = new AbortController();
    const { api } = fakeApi({ wait: async () => ctl.abort() });
    const end = await runProduction({ scenes: scenes(3), api, signal: ctl.signal });
    expect(end.phase).toBe('stopped');
    expect(end.scenes.some((s) => s.status === 'done')).toBe(false);
  });

  it('gives up on a job that never leaves the queue', async () => {
    let t = 0;
    const { api } = fakeApi({ generate: async () => ({ jobId: 'x', status: 'queued' }), status: async () => ({ jobId: 'x', status: 'processing' }), wait: async () => { t += 60_000; } });
    const end = await runProduction({ scenes: scenes(1), api, sceneTimeoutMs: 120_000, maxAttempts: 1, now: () => t });
    expect(end.phase).toBe('failed');
    expect(end.error).toMatch(/Timed out/);
  });

  it('reports a failed join and keeps all scenes so only the join needs retrying', async () => {
    const { api } = fakeApi({ render: async () => ({ jobId: 'r', status: 'failed', message: 'ffmpeg missing' }) });
    const end = await runProduction({ scenes: scenes(2), api });
    expect(end.phase).toBe('failed');
    expect(end.error).toBe('ffmpeg missing');
    expect(end.scenes.every((s) => s.status === 'done')).toBe(true);
  });
});

describe('progress maths', () => {
  const mk = (statuses: ('queued' | 'generating' | 'done' | 'failed')[], d = 10) => ({
    phase: 'running' as const,
    scenes: statuses.map((status, i) => ({ id: `s${i}`, duration: d, status, attempt: 1, startedAt: status === 'queued' ? undefined : 0, finishedAt: status === 'done' ? 20_000 : undefined })),
  });
  it('overall progress is produced seconds, with 5% held back for the join', () => {
    expect(overallProgress(initialState(scenes(4)))).toBe(0);
    expect(overallProgress(mk(['done', 'done', 'queued', 'queued']))).toBeCloseTo(0.475);
    expect(overallProgress(mk(['done', 'done', 'done', 'done']))).toBeCloseTo(0.95);
    expect(overallProgress({ ...mk(['done']), phase: 'done' })).toBe(1);
  });
  it('weights by seconds, not by scene count', () => {
    const s = { phase: 'running' as const, scenes: [{ id: 'a', duration: 30, status: 'done' as const, attempt: 1 }, { id: 'b', duration: 10, status: 'queued' as const, attempt: 0 }] };
    expect(overallProgress(s)).toBeCloseTo(0.75 * 0.95);
  });
  it('ETA appears only after a scene has finished and shrinks as time passes', () => {
    expect(etaSeconds(initialState(scenes(3)), 0)).toBeUndefined();
    const s = mk(['done', 'generating', 'queued']);
    const a = etaSeconds(s, 20_000)!;
    const b = etaSeconds(s, 30_000)!;
    expect(a).toBeGreaterThan(b);
    expect(etaSeconds({ ...s, phase: 'done' }, 0)).toBe(0);
  });
  it('ring arcs are proportional to scene length, in order, and never overlap', () => {
    const arcs = ringArcs([{ id: 'a', duration: 30, status: 'done', attempt: 1 }, { id: 'b', duration: 10, status: 'queued', attempt: 0 }]);
    expect(arcs[0]!.end - arcs[0]!.start).toBeGreaterThan(2 * (arcs[1]!.end - arcs[1]!.start));
    expect(arcs[0]!.end).toBeLessThanOrEqual(arcs[1]!.start);
    expect(arcs[1]!.end).toBeLessThanOrEqual(1);
    expect(ringArcs([])).toEqual([]);
  });
  it('arcPath starts at 12 o’clock and uses the large-arc flag past half a turn', () => {
    expect(arcPath(50, 50, 40, 0, 0.25)).toBe('M 50.00 10.00 A 40 40 0 0 1 90.00 50.00');
    expect(arcPath(50, 50, 40, 0, 0.75)).toContain(' 0 1 1 ');
    expect(arcPath(50, 50, 40, 0, 1)).toMatch(/^M 50\.00 10\.00 A 40 40 0 1 1 /);
  });
});
