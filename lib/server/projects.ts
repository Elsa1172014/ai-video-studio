// Educational Studio projects. Kept separate from Series Studio data.
import * as db from './db';
import {newId, notFound} from './http';
import type {EducationProject} from '@/lib/types';
import {attachShots} from '@/lib/prompts';
import {detectLanguage} from '@/lib/planner';
import {plan} from './director';
import {maxShotSeconds} from './config';

const now = () => new Date().toISOString();

export const listProjects = () => db.list<EducationProject>('project');

export async function getProject(id: string) {
  const p = await db.get<EducationProject>('project', id);
  if (!p) throw notFound('Project');
  return p;
}

type Input = Partial<Pick<EducationProject, 'title' | 'sourceText' | 'minutes' | 'language' | 'aspectRatio' | 'narratorVoice'>>;

export async function createProject(input: Input & {title: string; sourceText: string}) {
  const p: EducationProject = {
    id: newId(), title: input.title, sourceText: input.sourceText, minutes: input.minutes ?? 3,
    language: input.language ?? detectLanguage(input.sourceText), aspectRatio: input.aspectRatio ?? '16:9',
    narratorVoice: input.narratorVoice, createdAt: now(), updatedAt: now(),
  };
  return db.put('project', p.id, '', p);
}

export async function updateProject(id: string, input: Input) {
  const p = await getProject(id);
  return db.put('project', id, '', {...p, ...input, updatedAt: now()});
}

export async function deleteProject(id: string) {
  await getProject(id);
  await db.removeChildren('job', id);
  await db.remove('project', id);
}

export async function buildProjectStoryboard(id: string) {
  const p = await getProject(id);
  const board = await plan({mode: 'education', text: p.sourceText, minutes: p.minutes, language: p.language, characters: [], title: p.title});
  const storyboard = attachShots(board, {mode: 'education', aspectRatio: p.aspectRatio, characters: [], maxShotSeconds: maxShotSeconds()});
  return db.put('project', id, '', {...p, storyboard, updatedAt: now()});
}
