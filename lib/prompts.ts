// Builds the GPU prompts for each shot and the bounded continuity context for series episodes.
import type {AspectRatio, Character, Episode, Mode, Scene, Storyboard} from '@/lib/types';
import {splitShots} from '@/lib/planner';

const CAMERA = ['establishing wide shot', 'medium shot', 'close-up on the key subject', 'slow tracking shot', 'over-the-shoulder shot', 'low-angle shot'];
const MAX_PROMPT = 1800;
const clip = (t: string | undefined, n: number) => (!t ? '' : t.length > n ? t.slice(0, n - 1) + '…' : t);

export function characterCard(c: Character) {
  const look = [c.age && `age ${c.age}`, c.build, c.hair && `hair: ${c.hair}`, c.appearance].filter(Boolean).join(', ');
  return `${c.name}${c.role ? ` (${c.role})` : ''}: ${look}${c.wardrobe ? `; wearing ${c.wardrobe}` : ''}${c.negativeConstraints ? `; never: ${c.negativeConstraints}` : ''}`;
}

/**
 * Bounded, relevance-ordered memory of earlier episodes: the latest episode in full
 * structure, the two before it as summaries, older ones only as still-open threads.
 */
export function continuityDigest(previous: Episode[], present: Character[] = [], limit = 1500): string {
  const eps = previous.filter(e => e.memory).sort((a, b) => a.number - b.number);
  if (!eps.length) return '';
  const last = eps[eps.length - 1];
  const m = last.memory!;
  const presentNames = new Set(present.map(c => c.name.toLowerCase()));
  const states = m.characterStates.filter(s => !presentNames.size || presentNames.has(s.name.toLowerCase()));
  const parts = [
    `Previously (episode ${last.number}): ${m.summary}`,
    m.finalSceneState && `Episode ${last.number} ended with: ${m.finalSceneState}`,
    m.nextEpisodeNotes && `Carry forward: ${m.nextEpisodeNotes}`,
    states.length && `Character state: ${states.map(s => `${s.name}: ${s.state}`).join('; ')}`,
    m.wardrobeProps.length && `Wardrobe/props: ${m.wardrobeProps.join('; ')}`,
    m.acquired.length && `Acquired (injuries/objects/knowledge): ${m.acquired.join('; ')}`,
    m.relationshipChanges.length && `Relationships: ${m.relationshipChanges.join('; ')}`,
    m.locations.length && `Locations: ${m.locations.join('; ')}`,
  ];
  for (const e of eps.slice(-3, -1).reverse()) parts.push(`Episode ${e.number}: ${clip(e.memory!.summary, 240)}`);
  const open = [...new Set(eps.flatMap(e => e.memory!.unresolvedThreads))].slice(-8);
  if (open.length) parts.push(`Unresolved threads: ${open.join('; ')}`);
  return clip(parts.filter(Boolean).join('\n'), limit);
}

export type PromptContext = {
  mode: Mode;
  aspectRatio: AspectRatio;
  style?: string;
  characters: Character[];
  continuity?: string;
  maxShotSeconds: number;
};

export function attachShots(board: Omit<Storyboard, 'createdAt'>, ctx: PromptContext): Storyboard {
  const scenes = board.scenes.map((s, i) => finishScene(s, board.scenes[i - 1], board.scenes.length, ctx));
  return {...board, scenes, createdAt: new Date().toISOString()};
}

export function finishScene(s: Scene, prev: Scene | undefined, total: number, ctx: PromptContext): Scene {
  const cast = ctx.characters.filter(c => s.characterIds.includes(c.id));
  const lead = cast.find(c => c.referenceImage?.url);
  const lengths = splitShots(s.duration, ctx.maxShotSeconds);
  const shots = lengths.map((d, j) => ({id: crypto.randomUUID(), duration: d, prompt: shotPrompt(s, prev, total, j, lengths.length, cast, ctx)}));
  return {...s, shots, referenceImageUrl: ctx.mode === 'series' ? lead?.referenceImage?.url : undefined};
}

function shotPrompt(s: Scene, prev: Scene | undefined, total: number, j: number, n: number, cast: Character[], ctx: PromptContext) {
  const shot = `Shot ${j + 1} of ${n}: ${CAMERA[(s.index + j) % CAMERA.length]}.`;
  const frame = ctx.aspectRatio === '9:16' ? 'vertical 9:16 frame' : ctx.aspectRatio === '1:1' ? 'square frame' : 'widescreen 16:9 frame';
  const lines = ctx.mode === 'education'
    ? [
        `Educational explainer video, ${frame}${ctx.style ? `, ${ctx.style}` : ''}.`,
        `Learning beat ${s.index + 1} of ${total}: ${clip(s.visual, 700)}`,
        'Visualise exactly this content with clear demonstrations. Do not depict facts that are not in the text.',
        shot,
        'Clean, well-lit, learner-friendly composition. No on-screen text, subtitles or logos.',
      ]
    : [
        `Cinematic series episode, ${frame}${ctx.style ? `, ${ctx.style}` : ''}.`,
        `Scene ${s.index + 1} of ${total} (${s.phase}): ${clip(s.visual, 600)}`,
        cast.length && `Characters, identical in every shot: ${cast.map(characterCard).join(' | ')}`,
        ctx.continuity && `Continuity: ${clip(ctx.continuity.replace(/\n/g, ' '), 450)}`,
        prev && `Previous scene: ${clip(prev.visual, 160)}`,
        shot,
        'Natural motion, consistent lighting and locations. No on-screen text, subtitles or logos.',
      ];
  return clip(lines.filter(Boolean).join('\n'), MAX_PROMPT);
}
