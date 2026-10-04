// Editing one scene of a stored storyboard. Changed scenes get fresh shots (new ids), so their
// old clips are no longer used; untouched scenes keep their completed clips.
import * as db from './db';
import {HttpError, notFound} from './http';
import type {DialogueLine, OwnerKind, Scene} from '@/lib/types';
import {finishScene} from '@/lib/prompts';
import {getEpisode, seriesContext} from './series';
import {getProject} from './projects';
import {maxShotSeconds} from './config';
import {MAX_SCENE, MIN_SCENE} from '@/lib/planner';

export type ScenePatch = Partial<{title: string; narration: string; dialogue: DialogueLine[]; visual: string; duration: number; characterIds: string[]}>;

export async function editScene(kind: OwnerKind, id: string, sceneId: string, patch: ScenePatch) {
  if (patch.duration !== undefined && (patch.duration < MIN_SCENE / 2 || patch.duration > MAX_SCENE * 2)) throw new HttpError(400, 'Scene duration out of range');
  if (kind === 'episode') {
    const e = await getEpisode(id);
    const scenes = e.storyboard?.scenes;
    const i = scenes?.findIndex(s => s.id === sceneId) ?? -1;
    if (!scenes || i < 0) throw notFound('Scene');
    const ctx = await seriesContext(e.seriesId, e.number);
    const merged: Scene = {...scenes[i], ...patch};
    const next = finishScene(merged, scenes[i - 1], scenes.length, {mode: 'series', aspectRatio: e.aspectRatio, style: ctx.series.style, characters: ctx.characters, continuity: ctx.continuity, maxShotSeconds: maxShotSeconds()});
    const updated = scenes.map((s, k) => (k === i ? next : s));
    return db.put('episode', id, e.seriesId, {...e, storyboard: {...e.storyboard!, scenes: updated}, updatedAt: new Date().toISOString()});
  }
  const p = await getProject(id);
  const scenes = p.storyboard?.scenes;
  const i = scenes?.findIndex(s => s.id === sceneId) ?? -1;
  if (!scenes || i < 0) throw notFound('Scene');
  const merged: Scene = {...scenes[i], ...patch, dialogue: []};
  const next = finishScene(merged, scenes[i - 1], scenes.length, {mode: 'education', aspectRatio: p.aspectRatio, characters: [], maxShotSeconds: maxShotSeconds()});
  const updated = scenes.map((s, k) => (k === i ? next : s));
  return db.put('project', id, '', {...p, storyboard: {...p.storyboard!, scenes: updated}, updatedAt: new Date().toISOString()});
}
