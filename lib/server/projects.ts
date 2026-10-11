// Educational Studio projects. Kept separate from Series Studio data.
import * as db from './db';
import {newId, notFound, HttpError} from './http';
import type {EducationProject, Job} from '@/lib/types';
import {attachShots} from '@/lib/prompts';
import {detectLanguage, planTimedScenes} from '@/lib/planner';
import {plan} from './director';
import {directedBoard} from '@/lib/creative';
import {maxShotSeconds} from './config';

const now = () => new Date().toISOString();

export const listProjects = () => db.list<EducationProject>('project');

export async function getProject(id: string) {
  const p = await db.get<EducationProject>('project', id);
  if (!p) throw notFound('Project');
  return p;
}

type Input = Partial<Pick<EducationProject, 'title' | 'sourceText' | 'minutes' | 'language' | 'aspectRatio' | 'narratorVoice' | 'durationSeconds' | 'durationMode' | 'direction'>>;

export async function createProject(input: Input & {title: string; sourceText: string}) {
  const p: EducationProject = {
    id: newId(), title: input.title, sourceText: input.sourceText, minutes: input.durationSeconds ? input.durationSeconds / 60 : input.minutes ?? 3,
    language: input.language ?? detectLanguage(input.sourceText), aspectRatio: input.aspectRatio ?? '16:9',
    durationSeconds: input.durationSeconds ?? Math.round((input.minutes ?? 3) * 60), durationMode: input.durationMode ?? 'fit',
    direction: input.direction, narratorVoice: input.narratorVoice, createdAt: now(), updatedAt: now(),
  };
  return db.put('project', p.id, '', p);
}

export async function updateProject(id: string, input: Input) {
  const p = await getProject(id);
  const durationSeconds = input.durationSeconds ?? (input.minutes !== undefined ? Math.round(input.minutes * 60) : p.durationSeconds);
  const rebuild = (input.direction !== undefined && JSON.stringify(input.direction) !== JSON.stringify(p.direction)) || (input.sourceText !== undefined && input.sourceText !== p.sourceText) || (durationSeconds !== undefined && durationSeconds !== (p.durationSeconds ?? Math.round(p.minutes * 60))) || (input.durationMode !== undefined && input.durationMode !== (p.durationMode ?? 'fit')) || (input.aspectRatio !== undefined && input.aspectRatio !== p.aspectRatio);
  if (rebuild && (await db.list<Job>('job', id)).some(j => j.status === 'processing' || j.status === 'queued')) throw new HttpError(409, 'أوقف الإنتاج الجاري قبل تعديل مدته أو نصه.');
  return db.put('project', id, '', {...p, ...input, ...(rebuild ? {storyboard: undefined} : {}), durationSeconds, minutes: durationSeconds ? durationSeconds / 60 : p.minutes, updatedAt: now()});
}

export async function deleteProject(id: string) {
  await getProject(id);
  await db.removeChildren('job', id);
  await db.remove('project', id);
}

export async function buildProjectStoryboard(id: string) {
  const p = await getProject(id);
  const active = (await db.list<Job>('job', id)).some(j => j.status === 'processing' || j.status === 'queued');
  if (active) throw new HttpError(409, 'أوقف الإنتاج الجاري قبل إعادة بناء المشاهد.');
  const seconds = p.durationSeconds ?? Math.round(p.minutes * 60);
  const input = {mode: 'education' as const, text: p.sourceText, minutes: seconds / 60, language: p.language, characters: p.direction?.characters || [], title: p.title};
  const board = p.direction?.beats.length ? directedBoard(p.direction, seconds) : (p.durationMode ?? 'fit') === 'fit' ? planTimedScenes(input, seconds) : await plan(input);
  const storyboard = attachShots(board, {mode: 'education', aspectRatio: p.aspectRatio, style: p.direction ? [p.direction.format,p.direction.style,p.direction.execution].join('. ') : undefined, characters: p.direction?.characters || [], maxShotSeconds: maxShotSeconds()});
  return db.put('project', id, '', {...p, storyboard, updatedAt: now()});
}
