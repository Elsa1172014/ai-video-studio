import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {mkdtempSync, rmSync} from 'fs';
import {tmpdir} from 'os';
import path from 'path';

const dir = mkdtempSync(path.join(tmpdir(), 'studio-test-'));
beforeAll(() => {
  process.env.DATA_DIR = dir;
  if (!process.env.TEST_DATABASE_URL) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.RUNPOD_API_KEY; delete process.env.RUNPOD_ENDPOINT_ID; delete process.env.GPU_API_URL;
  delete process.env.BLOB_READ_WRITE_TOKEN; delete process.env.S3_BUCKET;
});
afterAll(async () => {(await import('@/lib/server/db')).resetForTests(); rmSync(dir, {recursive: true, force: true});});

describe('series persistence and character lock', () => {
  it('enforces the identity lock and loads memory into the next episode', async () => {
    const S = await import('@/lib/server/series');
    const s = await S.saveSeries({title: 'The Library', language: 'en'});
    const c = await S.createCharacter(s.id, {name: 'Omar', appearance: 'round face', wardrobe: 'white kandura', voice: {provider: 'tts', voiceId: 'omar-v1'}});
    await S.setLock(s.id, c.id, true);

    await expect(S.updateCharacter(s.id, c.id, {wardrobe: 'red hoodie'})).rejects.toMatchObject({status: 409});
    await expect(S.updateCharacter(s.id, c.id, {voice: {provider: 'tts', voiceId: 'other'}})).rejects.toMatchObject({status: 409});
    await expect(S.deleteCharacter(s.id, c.id)).rejects.toMatchObject({status: 409});
    // non-identity fields stay editable; unchanged identity fields are fine
    const ok = await S.updateCharacter(s.id, c.id, {relationships: 'Mariam\'s cousin', wardrobe: 'white kandura'});
    expect(ok.relationships).toBe('Mariam\'s cousin');
    await S.setLock(s.id, c.id, false);
    expect((await S.updateCharacter(s.id, c.id, {wardrobe: 'school uniform'})).wardrobe).toBe('school uniform');
    await S.setLock(s.id, c.id, true);

    const e1 = await S.createEpisode(s.id, {title: 'Pilot', goal: 'Omar finds a map in the library.\nOmar: What is this?', minutes: 1});
    const built = await S.buildEpisodeStoryboard(e1.id);
    expect(built.storyboard!.scenes.length).toBeGreaterThan(0);
    expect(built.storyboard!.scenes.some(x => x.shots[0].prompt.includes('school uniform'))).toBe(true);

    const draft = await S.draftMemory(e1.id);
    await S.saveMemory(e1.id, {...draft, unresolvedThreads: ['Who drew the map?'], finalSceneState: 'Omar hides the map in his bag', source: 'manual'});

    const e2 = await S.createEpisode(s.id, {title: 'The Basement', goal: 'Omar follows the map to the basement.', minutes: 1});
    expect(e2.number).toBe(2);
    const ctx = await S.seriesContext(s.id, e2.number);
    expect(ctx.characters[0].voice?.voiceId).toBe('omar-v1');
    expect(ctx.characters[0].locked).toBe(true);
    expect(ctx.continuity).toContain('Omar hides the map in his bag');
    expect(ctx.continuity).toContain('Who drew the map?');
    const b2 = await S.buildEpisodeStoryboard(e2.id);
    expect(b2.storyboard!.scenes[0].shots[0].prompt).toContain('Omar hides the map');
  });
});

describe('jobs', () => {
  it('fails clearly when no GPU is configured and maps voices per speaker', async () => {
    const P = await import('@/lib/server/projects');
    const J = await import('@/lib/server/jobs');
    const p = await P.createProject({title: 'Water', sourceText: 'Water boils at 100 degrees Celsius at sea level. Heat makes molecules move faster.', minutes: 0.5});
    const built = await P.buildProjectStoryboard(p.id);
    const scene = built.storyboard!.scenes[0];
    const {job} = await J.createJob('project', p.id, {type: 'video', sceneId: scene.id, shotId: scene.shots[0].id});
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/GPU is not configured/);
    await expect(J.createJob('project', p.id, {type: 'render'})).rejects.toMatchObject({status: 409});
    const view = await J.production('project', p.id);
    expect(view.jobs).toHaveLength(1);
  });

  it('audio input uses each character\'s locked voice', async () => {
    const J = await import('@/lib/server/jobs');
    const owner: any = {characters: [{id: 'c1', name: 'Omar', voice: {provider: 'tts', voiceId: 'omar-v1'}}], language: 'ar', narratorVoice: {provider: 'tts', voiceId: 'narr'}};
    const {input, warnings} = J.audioInput(owner, {narration: 'Once upon a time', dialogue: [{speaker: 'Omar', speakerId: 'c1', text: 'Hi'}, {speaker: 'Guest', text: 'Hello'}], duration: 12} as any);
    expect((input.segments as any[]).map(s => s.voice)).toEqual(['narr', 'omar-v1', 'narr']);
    expect(warnings[0]).toMatch(/Guest has no voice/);
  });
});

describe('gpu normalisation', () => {
  it('normalises RunPod states', async () => {
    const {_test} = await import('@/lib/server/gpu');
    expect(_test.normalizeRunpod({id: 'a', status: 'IN_QUEUE'}).status).toBe('queued');
    expect(_test.normalizeRunpod({id: 'a', status: 'IN_PROGRESS'}).status).toBe('processing');
    expect(_test.normalizeRunpod({id: 'a', status: 'COMPLETED', output: {outputUrl: 'https://cdn/x.mp4'}})).toMatchObject({status: 'completed', outputUrl: 'https://cdn/x.mp4'});
    expect(_test.normalizeRunpod({id: 'a', status: 'COMPLETED', output: {outputUrl: '/outputs/x.mp4'}}).status).toBe('failed');
    expect(_test.normalizeRunpod({id: 'a', status: 'COMPLETED', output: {status: 'failed', message: 'OOM'}})).toMatchObject({status: 'failed', message: 'OOM'});
    expect(_test.normalizeRunpod({id: 'a', status: 'TIMED_OUT'}).status).toBe('failed');
  });
});

describe('security helpers', () => {
  it('sniffs media types by content, not extension', async () => {
    const {sniff, validate} = await import('@/lib/server/storage');
    expect(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniff(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    expect(() => validate(new TextEncoder().encode('<html>'), ['image'])).toThrow(/Unsupported/);
  });

  it('blocks private and non-http URLs', async () => {
    const {assertSafeUrl, _test} = await import('@/lib/server/net');
    for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.2', '169.254.169.254', '::1', 'fd00::1']) expect(_test.privateIp(ip)).toBe(true);
    expect(_test.privateIp('8.8.8.8')).toBe(false);
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toMatchObject({status: 400});
    await expect(assertSafeUrl('https://169.254.169.254/latest')).rejects.toMatchObject({status: 400});
    await expect(assertSafeUrl('http://example.com/a.jpg')).rejects.toMatchObject({status: 400});
  });

  it('rejects unsafe ids', async () => {
    const {param} = await import('@/lib/server/http');
    expect(() => param('../../etc')).toThrow();
    expect(param('3f1c0e2a-1b2c-4d5e-8f90-123456789abc')).toBeTruthy();
  });
});

vi.setConfig({testTimeout: 30000});
