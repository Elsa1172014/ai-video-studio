import { describe, expect, it, vi } from 'vitest';
import { refineWithLlm } from '@/lib/llm';
import { POST } from '@/app/api/story/analyze/route';
import { analyzeStory } from '@/lib/story';

const post = (b: unknown) => POST(new Request('http://x/api/story/analyze', { method: 'POST', body: JSON.stringify(b) }));
const STORY = 'Lina lived near the forest. She met a fox called Rami. Moral: share what you have.';

describe('POST /api/story/analyze', () => {
  it('returns bible + scenes whose durations equal the chosen seconds', async () => {
    const r = await post({ text: STORY, minutes: 1, seconds: 30 });
    const d = await r.json();
    expect(r.status).toBe(200);
    expect(d.totalSeconds).toBe(90);
    expect(d.scenes.reduce((n: number, s: { duration: number }) => n + s.duration, 0)).toBe(90);
    expect(d.bible.analysis).toBe('rules');
    expect(d.bible.characters.map((c: { name: string }) => c.name)).toEqual(expect.arrayContaining(['Lina', 'Rami']));
  });
  it('seconds alone are honoured exactly (45 s)', async () => {
    const d = await (await post({ text: STORY, seconds: 45 })).json();
    expect(d.scenes.reduce((n: number, s: { duration: number }) => n + s.duration, 0)).toBe(45);
  });
  it('rejects a zero length and a too-short story with a readable error', async () => {
    expect((await post({ text: STORY })).status).toBe(400);
    const r = await post({ text: 'hi', seconds: 10 });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/at least a sentence/);
  });
});

describe('refineWithLlm', () => {
  const base = analyzeStory(STORY);
  const reply = (content: string) => vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));
  const env = { STORY_LLM_URL: 'http://llm.local/v1/', STORY_LLM_MODEL: 'm' };

  it('does nothing and sends nothing when no model is configured', async () => {
    const f = vi.fn();
    expect(await refineWithLlm(STORY, base, {}, f as never)).toBe(base);
    expect(f).not.toHaveBeenCalled();
  });
  it('merges model output and drops characters that are not in the story', async () => {
    const f = reply(JSON.stringify({ message: 'Sharing matters', characters: [{ name: 'Lina', description: 'a girl of nine with a braid and a red coat' }, { name: 'Zorg', description: 'an invented alien with green skin' }] }));
    const out = await refineWithLlm(STORY, base, env, f as never);
    expect(out.analysis).toBe('llm');
    expect(out.message).toBe('Sharing matters');
    expect(out.characters.map((c) => c.name)).toEqual(['Lina']);
    expect(out.characters[0]!.description).toContain('red coat');
    expect(f.mock.calls[0]![0]).toBe('http://llm.local/v1/chat/completions');
  });
  it('accepts JSON wrapped in a code fence', async () => {
    const out = await refineWithLlm(STORY, base, env, reply('```json\n{"tone":"warm"}\n```') as never);
    expect(out.tone).toBe('warm');
  });
  it.each([['invalid JSON', reply('not json')], ['wrong shape', reply('{"characters":"x"}')], ['HTTP error', vi.fn().mockResolvedValue(new Response('no', { status: 500 }))], ['network error', vi.fn().mockRejectedValue(new Error('down'))]])('falls back to the rule-based result on %s', async (_n, f) => {
    expect(await refineWithLlm(STORY, base, env, f as never)).toBe(base);
  });
});
