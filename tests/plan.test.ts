import { describe, expect, it } from 'vitest';
import { buildPlan } from '@/lib/plan';
import { analyzeStory, buildScenes } from '@/lib/story';

describe('buildPlan', () => {
  const bible = analyzeStory('Lina lived near the forest. Lina met a fox called Rami. Moral: share.');
  const scenes = buildScenes(bible, 45);
  it('keeps the exact total, scene order and per-scene reference image', () => {
    const plan = buildPlan(bible.title, scenes, (s) => (s.index === 0 ? 'https://ref/lina.jpg' : undefined));
    expect(plan.version).toBe(1);
    expect(plan.totalSeconds).toBe(45);
    expect(plan.scenes.map((s) => s.id)).toEqual(scenes.map((s) => s.id));
    expect(plan.scenes[0]!.imageUrl).toBe('https://ref/lina.jpg');
    expect(plan.scenes[1]).not.toHaveProperty('imageUrl');
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });
});
