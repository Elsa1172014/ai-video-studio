import type { StoryScene } from './story';

/** Portable production plan: everything an offline GPU runner (worker/batch.py) needs to make the video. */
export interface ProductionPlan {
  version: 1;
  title: string;
  totalSeconds: number;
  scenes: { id: string; prompt: string; duration: number; continuity: 'chain' | 'fresh'; imageUrl?: string }[];
}

export function buildPlan(title: string, scenes: StoryScene[], referenceFor: (s: StoryScene) => string | undefined): ProductionPlan {
  return {
    version: 1,
    title,
    totalSeconds: scenes.reduce((n, s) => n + s.duration, 0),
    scenes: scenes.map((s) => ({ id: s.id, prompt: s.prompt, duration: s.duration, continuity: s.continuity, ...(referenceFor(s) ? { imageUrl: referenceFor(s) } : {}) })),
  };
}
