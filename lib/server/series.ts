// Series, Character Bible (with identity lock) and Episodes, including episode memory.
import * as db from './db';
import {HttpError, newId, notFound} from './http';
import type {Character, Episode, EpisodeMemory, Series} from '@/lib/types';
import {continuityDigest, attachShots} from '@/lib/prompts';
import {plan, directorEnabled, draftMemoryLLM} from './director';
import {maxShotSeconds} from './config';

const now = () => new Date().toISOString();

// ---------- series ----------
export async function getSeries(id: string) {
  const s = await db.get<Series>('series', id);
  if (!s) throw notFound('Series');
  return s;
}
export const listSeries = () => db.list<Series>('series');

export async function saveSeries(input: Partial<Series> & {title: string}, id?: string) {
  const prev = id ? await getSeries(id) : null;
  const s: Series = {
    id: prev?.id || newId(),
    title: input.title,
    logline: input.logline ?? prev?.logline,
    style: input.style ?? prev?.style,
    language: input.language ?? prev?.language ?? 'ar',
    aspectRatio: input.aspectRatio ?? prev?.aspectRatio ?? '16:9',
    narratorVoice: input.narratorVoice ?? prev?.narratorVoice,
    createdAt: prev?.createdAt || now(),
    updatedAt: now(),
  };
  return db.put('series', s.id, '', s);
}

export async function deleteSeries(id: string) {
  await getSeries(id);
  for (const e of await listEpisodes(id)) {await db.removeChildren('job', e.id); await db.remove('episode', e.id);}
  await db.removeChildren('character', id);
  await db.remove('series', id);
}

// ---------- characters ----------
/** Identity-defining fields: frozen while a character is locked. */
export const IDENTITY_FIELDS = ['name', 'appearance', 'age', 'build', 'hair', 'wardrobe', 'personality', 'negativeConstraints', 'referenceImage', 'voice'] as const;
type CharacterInput = Partial<Omit<Character, 'id' | 'seriesId' | 'locked' | 'lockedAt' | 'createdAt' | 'updatedAt'>>;

export const listCharacters = async (seriesId: string) =>
  (await db.list<Character>('character', seriesId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export async function getCharacter(seriesId: string, id: string) {
  const c = await db.get<Character>('character', id);
  if (!c || c.seriesId !== seriesId) throw notFound('Character');
  return c;
}

export async function createCharacter(seriesId: string, input: CharacterInput & {name: string; appearance: string}) {
  await getSeries(seriesId);
  const c: Character = {...input, id: newId(), seriesId, locked: false, createdAt: now(), updatedAt: now()};
  return db.put('character', c.id, seriesId, c);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function lockedChanges(prev: Character, input: CharacterInput) {
  return IDENTITY_FIELDS.filter(f => f in input && !same((input as any)[f], (prev as any)[f]));
}

export async function updateCharacter(seriesId: string, id: string, input: CharacterInput) {
  const prev = await getCharacter(seriesId, id);
  if (prev.locked) {
    const changed = lockedChanges(prev, input);
    if (changed.length) throw new HttpError(409, `${prev.name} is locked. Unlock the character to change: ${changed.join(', ')}`, {lockedFields: changed});
  }
  const next: Character = {...prev, ...input, id, seriesId, locked: prev.locked, lockedAt: prev.lockedAt, updatedAt: now()};
  return db.put('character', id, seriesId, next);
}

export async function setLock(seriesId: string, id: string, locked: boolean) {
  const prev = await getCharacter(seriesId, id);
  if (locked && (!prev.name.trim() || !prev.appearance.trim())) throw new HttpError(400, 'A character needs a name and appearance before it can be locked');
  const next: Character = {...prev, locked, lockedAt: locked ? now() : undefined, updatedAt: now()};
  return db.put('character', id, seriesId, next);
}

export async function deleteCharacter(seriesId: string, id: string) {
  const c = await getCharacter(seriesId, id);
  if (c.locked) throw new HttpError(409, `${c.name} is locked. Unlock before deleting.`);
  await db.remove('character', id);
}

// ---------- episodes ----------
export const listEpisodes = async (seriesId: string) =>
  (await db.list<Episode>('episode', seriesId)).sort((a, b) => a.number - b.number);

export async function getEpisode(id: string) {
  const e = await db.get<Episode>('episode', id);
  if (!e) throw notFound('Episode');
  return e;
}

export async function createEpisode(seriesId: string, input: {title: string; goal: string; minutes: number; number?: number}) {
  const s = await getSeries(seriesId);
  const eps = await listEpisodes(seriesId);
  const number = input.number ?? (eps.length ? eps[eps.length - 1].number + 1 : 1);
  if (eps.some(e => e.number === number)) throw new HttpError(409, `Episode ${number} already exists`);
  const e: Episode = {id: newId(), seriesId, number, title: input.title, goal: input.goal, minutes: input.minutes, aspectRatio: s.aspectRatio, createdAt: now(), updatedAt: now()};
  return db.put('episode', e.id, seriesId, e);
}

export async function updateEpisode(id: string, input: Partial<Pick<Episode, 'title' | 'goal' | 'minutes'>>) {
  const e = await getEpisode(id);
  return db.put('episode', id, e.seriesId, {...e, ...input, updatedAt: now()});
}

export async function deleteEpisode(id: string) {
  const e = await getEpisode(id);
  await db.removeChildren('job', id);
  await db.remove('episode', id);
  return e;
}

/** Canonical characters + bounded memory of all episodes before `number`. Loaded automatically for every new episode. */
export async function seriesContext(seriesId: string, beforeNumber?: number) {
  const [series, characters, episodes] = await Promise.all([getSeries(seriesId), listCharacters(seriesId), listEpisodes(seriesId)]);
  const previous = episodes.filter(e => beforeNumber === undefined || e.number < beforeNumber);
  return {
    series,
    characters,
    previousEpisodes: previous.map(e => ({id: e.id, number: e.number, title: e.title, memory: e.memory})),
    continuity: continuityDigest(previous, characters),
  };
}

export async function buildEpisodeStoryboard(id: string) {
  const e = await getEpisode(id);
  const ctx = await seriesContext(e.seriesId, e.number);
  const board = await plan({mode: 'series', text: e.goal, minutes: e.minutes, language: ctx.series.language, characters: ctx.characters, continuity: ctx.continuity, title: e.title});
  const storyboard = attachShots(board, {mode: 'series', aspectRatio: e.aspectRatio, style: ctx.series.style, characters: ctx.characters, continuity: ctx.continuity, maxShotSeconds: maxShotSeconds()});
  return db.put('episode', id, e.seriesId, {...e, storyboard, updatedAt: now()});
}

export async function draftMemory(id: string): Promise<EpisodeMemory> {
  const e = await getEpisode(id);
  if (!e.storyboard) throw new HttpError(400, 'Build the storyboard before saving memory');
  const ctx = await seriesContext(e.seriesId, e.number);
  const scenes = e.storyboard.scenes;
  if (directorEnabled()) {
    try {
      return {...(await draftMemoryLLM({title: e.title, goal: e.goal, scenes, characters: ctx.characters, continuity: ctx.continuity})), source: 'llm', savedAt: now()};
    } catch {/* deterministic draft below */}
  }
  const present = ctx.characters.filter(c => scenes.some(s => s.characterIds.includes(c.id)));
  const last = scenes[scenes.length - 1];
  return {
    summary: `${e.title}: ${e.goal.replace(/\s+/g, ' ').slice(0, 600)}`,
    unresolvedThreads: [],
    events: scenes.map(s => `${s.index + 1}. ${s.title}`),
    characterStates: present.map(c => ({characterId: c.id, name: c.name, state: `Appeared in scenes ${scenes.filter(s => s.characterIds.includes(c.id)).map(s => s.index + 1).join(', ')}`})),
    relationshipChanges: [],
    locations: [],
    wardrobeProps: present.filter(c => c.wardrobe).map(c => `${c.name}: ${c.wardrobe}`),
    acquired: [],
    finalSceneState: last ? last.visual.slice(0, 400) : '',
    nextEpisodeNotes: '',
    source: 'deterministic',
    savedAt: now(),
  };
}

export async function saveMemory(id: string, memory: Omit<EpisodeMemory, 'savedAt'>) {
  const e = await getEpisode(id);
  return db.put('episode', id, e.seriesId, {...e, memory: {...memory, savedAt: now()}, updatedAt: now()});
}
