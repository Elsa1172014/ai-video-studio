import { z } from 'zod';
import { idOf, type StoryBible } from './story';

/**
 * Optional refinement of the rule-based story analysis by a language model you host yourself (any OpenAI-compatible
 * endpoint, e.g. Ollama on the GPU worker: STORY_LLM_URL=http://host:11434/v1). Nothing is sent anywhere unless that
 * variable is set. Any failure returns the rule-based result unchanged.
 */
const Out = z.object({
  title: z.string().min(1).max(80).optional(),
  message: z.string().max(300).optional(),
  tone: z.string().max(80).optional(),
  setting: z.string().max(120).optional(),
  characters: z.array(z.object({ name: z.string().min(1).max(40), description: z.string().min(3).max(300) })).max(8).optional(),
});

const SYSTEM = [
  'You analyse a short story for a video production tool. Reply with ONE JSON object and nothing else:',
  '{"title":string,"message":string,"tone":string,"setting":string,"characters":[{"name":string,"description":string}]}',
  'Rules: use ONLY characters that appear in the story, keeping their names exactly as written. Write each description in English as a visual',
  'description a video model can follow (age, build, hair, clothing, distinguishing features); invent plausible visual details only where the story is silent.',
  '"message" is the moral or purpose of the story in one sentence in the story\'s language. Do not add events.',
].join(' ');

export async function refineWithLlm(text: string, base: StoryBible, env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Promise<StoryBible> {
  const url = env.STORY_LLM_URL?.replace(/\/$/, '');
  if (!url) return base;
  try {
    const res = await fetchImpl(`${url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(env.STORY_LLM_KEY ? { Authorization: `Bearer ${env.STORY_LLM_KEY}` } : {}) },
      body: JSON.stringify({
        model: env.STORY_LLM_MODEL || 'qwen2.5:7b',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text.slice(0, 12000) }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return base;
    const content = ((await res.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? '';
    const parsed = Out.parse(JSON.parse(content.replace(/^```(?:json)?|```$/g, '').trim()));
    // A model may invent people. Keep only names that really occur in the story.
    const characters = (parsed.characters ?? []).filter((c) => text.includes(c.name)).map((c) => ({ id: idOf(c.name), name: c.name, description: c.description }));
    return {
      ...base,
      title: parsed.title ?? base.title,
      message: parsed.message ?? base.message,
      tone: parsed.tone ?? base.tone,
      setting: parsed.setting ?? base.setting,
      characters: characters.length ? characters : base.characters,
      analysis: 'llm',
    };
  } catch {
    return base;
  }
}
