// Request schemas: every field bounded.
import {z} from 'zod';
import {Id} from './http';

const text = (max: number) => z.string().trim().max(max);
export const Aspect = z.enum(['16:9', '9:16', '1:1']);
export const Lang = z.enum(['ar', 'en']);
export const Minutes = z.number().min(0.5).max(30);

export const Voice = z.object({provider: text(40).min(1), voiceId: text(120).min(1), speakingStyle: text(300).optional()});
// Durable media URL, or a /api/files/ path from the local dev store.
const MediaUrl = z.string().max(2000).refine(u => /^https?:\/\//.test(u) || /^\/api\/files\/[A-Za-z0-9/._-]+$/.test(u), 'Invalid media URL');
export const Media = z.object({url: MediaUrl, key: text(300).optional(), durable: z.boolean(), contentType: text(80).optional()});

export const SeriesIn = z.object({
  title: text(160).min(1), logline: text(1000).optional(), style: text(400).optional(),
  language: Lang.optional(), aspectRatio: Aspect.optional(), narratorVoice: Voice.optional(),
});

export const CharacterIn = z.object({
  name: text(80).min(1), role: text(120).optional(), appearance: text(1500).min(1),
  age: text(40).optional(), build: text(200).optional(), hair: text(200).optional(), wardrobe: text(600).optional(),
  personality: text(600).optional(), relationships: text(800).optional(), negativeConstraints: text(600).optional(),
  referenceImage: Media.optional(), voice: Voice.optional(),
});
export const CharacterPatch = CharacterIn.partial().extend({referenceImage: Media.nullable().optional(), voice: Voice.nullable().optional()});

export const EpisodeIn = z.object({title: text(160).min(1), goal: text(40000).min(3), minutes: Minutes, number: z.number().int().min(1).max(10000).optional()});
export const EpisodePatch = EpisodeIn.omit({number: true}).partial();

export const ProjectIn = z.object({
  title: text(160).min(1), sourceText: text(60000).min(3), minutes: Minutes.optional(),
  language: Lang.optional(), aspectRatio: Aspect.optional(), narratorVoice: Voice.optional(),
});
export const ProjectPatch = ProjectIn.partial();

export const ScenePatch = z.object({
  title: text(200).optional(), narration: text(8000).optional(), visual: text(4000).optional(),
  duration: z.number().int().min(5).max(120).optional(), characterIds: z.array(Id).max(20).optional(),
  dialogue: z.array(z.object({speaker: text(80).min(1), speakerId: Id.optional(), text: text(2000).min(1)})).max(60).optional(),
});

export const Memory = z.object({
  summary: text(4000), unresolvedThreads: z.array(text(500)).max(40), events: z.array(text(500)).max(80),
  characterStates: z.array(z.object({characterId: Id.optional(), name: text(80), state: text(600)})).max(40),
  relationshipChanges: z.array(text(500)).max(40), locations: z.array(text(300)).max(40),
  wardrobeProps: z.array(text(400)).max(40), acquired: z.array(text(400)).max(40),
  finalSceneState: text(2000), nextEpisodeNotes: text(3000), source: z.enum(['llm', 'deterministic', 'manual']),
});

export const JobIn = z.object({
  ownerKind: z.enum(['episode', 'project']), ownerId: Id, type: z.enum(['video', 'audio', 'render']),
  sceneId: Id.optional(), shotId: Id.optional(), force: z.boolean().optional(),
});
