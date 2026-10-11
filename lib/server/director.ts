// Optional LLM director (Claude). Active only when ANTHROPIC_API_KEY is set; every result is
// schema-validated and checked, and any failure falls back to the deterministic planner.
import Anthropic from '@anthropic-ai/sdk';
import {betaZodOutputFormat} from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import type {Character, EpisodeMemory, Language, Mode, Scene, Storyboard} from '@/lib/types';
import {fitDurations, speechSeconds, planScenes} from '@/lib/planner';
import {characterCard} from '@/lib/prompts';

export const directorEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

const SceneOut = z.object({
  title: z.string(),
  sourceText: z.string().describe('Exact, verbatim text from the source that this scene covers (empty if the scene is newly written)'),
  narration: z.string().describe('Narrator voice-over for this scene'),
  dialogue: z.array(z.object({speaker: z.string(), text: z.string()})),
  visual: z.string().describe('What the viewer sees: setting, action, composition'),
  characters: z.array(z.string()).describe('Names of characters on screen'),
  phase: z.string(),
});
const PlanOut = z.object({scenes: z.array(SceneOut).min(1).max(120)});

const MemoryOut = z.object({
  summary: z.string(),
  unresolvedThreads: z.array(z.string()),
  events: z.array(z.string()),
  characterStates: z.array(z.object({name: z.string(), state: z.string()})),
  relationshipChanges: z.array(z.string()),
  locations: z.array(z.string()),
  wardrobeProps: z.array(z.string()),
  acquired: z.array(z.string()),
  finalSceneState: z.string(),
  nextEpisodeNotes: z.string(),
});

async function ask<T>(schema: z.ZodType<T>, system: string, user: string): Promise<T> {
  const client = new Anthropic();
  const res = await client.beta.messages.parse({
    model: MODEL(),
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {effort: 'medium', format: betaZodOutputFormat(schema)},
    system,
    messages: [{role: 'user', content: user}],
  }, {timeout: 120_000});
  if (res.stop_reason === 'refusal') throw new Error('Director declined the request');
  if (!res.parsed_output) throw new Error('Director returned no structured output');
  return res.parsed_output as T;
}

const norm = (t: string) => t.replace(/[\s‏‎]+/g, ' ').replace(/[“”"«»]/g, '').trim().toLowerCase();

/** Every source sentence must appear verbatim in some scene's narration (education: no rewriting). */
export function coversSource(source: string, narration: string[]) {
  const all = norm(narration.join(' '));
  return source.split(/(?<=[.!?؟؛…])\s+|\n+/).map(norm).filter(s => s.length > 3).every(s => all.includes(s));
}

export async function directStoryboard(x: {
  mode: Mode; text: string; minutes: number; language: Language; characters: Character[]; continuity?: string; title?: string;
}): Promise<Omit<Storyboard, 'createdAt'>> {
  const total = Math.round(x.minutes * 60);
  const system = x.mode === 'education'
    ? `You are the director of an educational video studio. Split the teacher's source text into teachable visual scenes in order.
Rules: the narration of each scene must be the source text itself, copied verbatim and in order, so that the scenes together contain all of it. Never add, remove or change facts. "visual" describes how to show that content (diagrams, demonstrations, examples) without inventing facts. Target ${total} seconds in total; each scene 10-60 seconds of narration. No dialogue.`
    : `You are the showrunner of a series studio. Turn the episode idea or script into connected dramatic scenes in order.
Rules: keep every character exactly as described in the character bible (face, age, body, wardrobe, voice); never redesign them. Respect the continuity notes from previous episodes and do not contradict them. If the user wrote a script, keep its lines. Each scene 10-60 seconds; target ${total} seconds in total. Use only character names from the bible for dialogue speakers, or "Narrator".`;
  const user = [
    x.title && `Title: ${x.title}`,
    x.mode === 'series' && x.characters.length && `Character bible:\n${x.characters.map(characterCard).join('\n')}`,
    x.continuity && `Continuity from previous episodes:\n${x.continuity}`,
    `Language for narration and dialogue: ${x.language === 'ar' ? 'Arabic' : 'English'}`,
    `${x.mode === 'education' ? 'Source text' : 'Episode idea / script'}:\n${x.text}`,
  ].filter(Boolean).join('\n\n');

  const out = await ask(PlanOut, system, user);
  if (x.mode === 'education' && !coversSource(x.text, out.scenes.map(s => s.narration))) {
    throw new Error('Director changed or dropped source text');
  }
  const byName = new Map(x.characters.map(c => [c.name.trim().toLowerCase(), c]));
  const est = out.scenes.map(s => speechSeconds(s.narration, x.language) + s.dialogue.reduce((a, d) => a + speechSeconds(d.text, x.language) + 0.5, 0) + 2);
  const durations = fitDurations(est, total);
  const scenes: Scene[] = out.scenes.map((s, i) => {
    const ids = new Set<string>();
    for (const n of [...s.characters, ...s.dialogue.map(d => d.speaker)]) {const c = byName.get(n.trim().toLowerCase()); if (c) ids.add(c.id);}
    return {
      id: crypto.randomUUID(), index: i, title: s.title, phase: s.phase,
      sourceText: s.sourceText, narration: s.narration,
      dialogue: s.dialogue.filter(d => d.speaker.toLowerCase() !== 'narrator').map(d => ({speaker: d.speaker, speakerId: byName.get(d.speaker.trim().toLowerCase())?.id, text: d.text})),
      visual: s.visual, characterIds: [...ids], duration: durations[i], shots: [],
    };
  });
  const sum = durations.reduce((a, b) => a + b, 0);
  return {planner: 'llm', totalSeconds: sum, narrationSeconds: Math.round(est.reduce((a, b) => a + b, 0)), warnings: sum > total + 5 ? [`Planned ${Math.ceil(sum / 60)} min for a ${x.minutes} min target.`] : [], scenes};
}

/** LLM director when configured, deterministic planner otherwise (or on any director failure). */
export async function plan(x: Parameters<typeof directStoryboard>[0]): Promise<Omit<Storyboard, 'createdAt'>> {
  if (directorEnabled()) {
    try {return await directStoryboard(x);}
    catch (e) {
      const fallback = planScenes(x);
      fallback.warnings.unshift(`AI director unavailable (${e instanceof Error ? e.message : 'error'}); used the deterministic planner.`);
      return fallback;
    }
  }
  return planScenes(x);
}

export async function draftMemoryLLM(x: {title: string; goal: string; scenes: Scene[]; characters: Character[]; continuity?: string}): Promise<Omit<EpisodeMemory, 'source' | 'savedAt'>> {
  const out = await ask(MemoryOut, 'You maintain the continuity bible of a TV series. Extract structured, factual continuity memory from the finished episode. Only record what happened in this episode.', [
    `Episode: ${x.title}`, `Episode goal: ${x.goal}`,
    x.continuity && `Earlier continuity:\n${x.continuity}`,
    `Characters:\n${x.characters.map(characterCard).join('\n')}`,
    `Scenes:\n${x.scenes.map(s => `${s.index + 1}. ${s.visual}\n${s.dialogue.map(d => `${d.speaker}: ${d.text}`).join('\n')}${s.narration ? `\nNarration: ${s.narration}` : ''}`).join('\n\n')}`,
  ].filter(Boolean).join('\n\n'));
  const byName = new Map(x.characters.map(c => [c.name.trim().toLowerCase(), c.id]));
  return {...out, characterStates: out.characterStates.map(s => ({...s, characterId: byName.get(s.name.trim().toLowerCase())}))};
}

const CreativeOut=z.object({beats:z.array(z.object({index:z.number().int(),idea:z.string(),narration:z.string(),evidence:z.array(z.string()),visual:z.string()})).min(1).max(60)});
export async function improveDirection(direction:import('@/lib/creative').FilmDirection, seconds:number) {
  if(!directorEnabled()) throw new Error('المخرج الذكي غير مفعّل. يمكنك تحرير الأفكار والتعليق المقترح يدويًا؛ لن نحذف أفكار النص تلقائيًا.');
  const out=await ask(CreativeOut,`Create an Arabic educational film treatment. Preserve the central idea of EVERY source paragraph and its causal links, caveats, named speakers, and evidence. Never merely select disconnected fragments. One output per input index. Summarize coherently in Arabic, maximum floor(duration * 1.6) spoken words per beat. Copy numerical evidence exactly, never invent figures or attribution. Include evidence as VERBATIM excerpts from that paragraph. visual is a specific shot description that teaches the idea and demonstrates its evidence; do not claim a dramatic recreation is documentary footage. Format: ${direction.format}. Style: ${direction.style}. Producer instructions: ${direction.execution}. Return all indices exactly once.`,JSON.stringify(direction.beats.map((b,index)=>({index,source:b.sourceText,duration:b.duration}))));
  if(out.beats.length!==direction.beats.length || new Set(out.beats.map(b=>b.index)).size!==direction.beats.length)throw new Error('لم يحافظ المقترح على جميع الفقرات. حرّر المقترح يدويًا أو أعد المحاولة.');
  const beats=direction.beats.map((b,index)=>{
    const v=out.beats.find(v=>v.index===index);if(!v)throw new Error('فقرة غير مغطاة في المقترح.');
    if(v.narration.trim().split(/\s+/).length>Math.floor(b.duration*1.8))throw new Error('الفكرة والأدلة تحتاج وقتًا أطول؛ زد المدة أو حرّر التعليق يدويًا.');
    if(v.evidence.some(e=>!norm(b.sourceText).includes(norm(e))))throw new Error('تعذر مطابقة الدليل بالنص الأصلي.');
    const numbers=b.sourceText.match(/[0-9٠-٩]+(?:[.,٫-][0-9٠-٩]+)*/g)||[];
    if(numbers.some(n=>!v.narration.includes(n)&&!v.evidence.some(e=>e.includes(n))))throw new Error('اختفى دليل رقمي من الفقرة؛ راجع المقترح.');
    return {...b,idea:v.idea,narration:v.narration,evidence:v.evidence,visual:v.visual};
  });return {...direction,beats};
}
