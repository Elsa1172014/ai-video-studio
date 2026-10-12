import { describe, expect, it, vi } from 'vitest';
import { hashScene, makeApi, playable, usableSaved, type Persisted } from '@/lib/clientApi';

const ok = (b: unknown) => vi.fn().mockImplementation(async () => new Response(JSON.stringify(b), { status: 200 }));

describe('makeApi', () => {
  it.each(['auto', 'hf', 'ltx'] as const)('sends the chosen engine (%s) with every scene', async (engine) => {
    const f = ok({ jobId: 'j', status: 'queued' });
    vi.stubGlobal('fetch', f);
    await makeApi(engine).generate({ prompt: 'p', duration: 5, imageUrl: 'https://i/x.jpg' });
    expect(JSON.parse(f.mock.calls[0]![1].body)).toEqual({ provider: engine, prompt: 'p', duration: 5, imageUrl: 'https://i/x.jpg' });
    vi.unstubAllGlobals();
  });
  it('turns server errors and non-JSON replies into a failed job with a readable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('<html>502</html>', { status: 502 })));
    expect((await makeApi('auto').generate({ prompt: 'p', duration: 5 })).message).toMatch(/502/);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ error: 'GPU not configured' }), { status: 500 })));
    expect((await makeApi('auto').status('x')).message).toBe('GPU not configured');
    vi.unstubAllGlobals();
  });
  it('render sends the planned durations', async () => {
    const f = ok({ status: 'completed', outputUrl: 'https://g/f.mp4' });
    vi.stubGlobal('fetch', f);
    await makeApi('auto').render(['a', 'b'], [8, 7]);
    expect(JSON.parse(f.mock.calls[0]![1].body)).toEqual({ clips: ['a', 'b'], durations: [8, 7] });
    vi.unstubAllGlobals();
  });
});

describe('resume helpers', () => {
  const scene = { id: 's1', prompt: 'p', duration: 8, continuity: 'fresh' as const };
  const persisted = (key: string): Persisted => ({ text: '', minutes: 0, seconds: 8, lang: 'ar', saved: { s1: { key, clipUrl: 'https://g/a.mp4', lastFrameUrl: 'https://g/a.jpg' } } });
  it('keeps a saved clip only while its scene is unchanged', () => {
    expect(usableSaved(persisted(hashScene(scene)), [scene]).s1?.clipUrl).toBe('https://g/a.mp4');
    expect(usableSaved(persisted(hashScene(scene)), [{ ...scene, prompt: 'edited' }])).toEqual({});
    expect(usableSaved(persisted(hashScene(scene)), [{ ...scene, duration: 9 }])).toEqual({});
    expect(usableSaved(undefined, [scene])).toEqual({});
  });
  it('playable maps a worker URL to the same-origin proxy', () => {
    expect(playable('https://gpu.example.com/outputs/a%20b.mp4?x=1')).toBe('/api/video/a%2520b.mp4');
    expect(playable(undefined)).toBeUndefined();
  });
});
