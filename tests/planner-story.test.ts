import { describe, expect, it } from 'vitest';
import { clampTotal, formatClock, MAX_TOTAL_SECONDS, planDurations, SCENE_MAX, SCENE_MIN, toSeconds } from '@/lib/planner';
import { analyzeStory, buildScenes, detectLanguage, splitBeats } from '@/lib/story';

describe('planDurations', () => {
  it.each([1, 2, 3, 4, 7, 10, 11, 30, 59, 60, 61, 90, 125, 300, 599, 600, 1799, 1800])('adds up exactly and stays in limits for %is', (t) => {
    const d = planDurations(t);
    expect(d.reduce((a, b) => a + b, 0)).toBe(t);
    if (t >= SCENE_MIN) for (const x of d) { expect(x).toBeGreaterThanOrEqual(SCENE_MIN); expect(x).toBeLessThanOrEqual(SCENE_MAX); }
  });
  it('aims for about 8 s per scene', () => expect(planDurations(120).length).toBe(15));
  it('returns nothing for 0 and caps at 30 minutes', () => {
    expect(planDurations(0)).toEqual([]);
    expect(planDurations(99999).reduce((a, b) => a + b, 0)).toBe(MAX_TOTAL_SECONDS);
  });
  it('helpers: toSeconds / clampTotal / formatClock', () => {
    expect(toSeconds(2, 30)).toBe(150);
    expect(toSeconds(Number.NaN, 45)).toBe(45);
    expect(clampTotal(-5)).toBe(0);
    expect(formatClock(150)).toBe('2:30');
    expect(formatClock(5)).toBe('0:05');
  });
});

describe('story analysis (Arabic)', () => {
  const story = 'في قرية صغيرة عاش الطفل عمر وأخته مريم. كان عمر يحب الاكتشاف والمغامرة. وفي يوم وجد عمر خريطة قديمة في المكتبة. قررت مريم مساعدة عمر. العبرة: التعاون بين الإخوة يصنع المستحيل.';
  const bible = analyzeStory(story);
  it('detects language, characters (with roles), setting, tone and the stated moral', () => {
    expect(bible.language).toBe('ar');
    expect(bible.characters.map((c) => c.name)).toEqual(expect.arrayContaining(['عمر', 'مريم']));
    expect(bible.characters[0]!.name).toBe('عمر'); // most mentioned first
    expect(bible.setting).toBe('قرية');
    expect(bible.tone).toContain('مغامرة');
    expect(bible.message).toBe('التعاون بين الإخوة يصنع المستحيل.');
    expect(bible.analysis).toBe('rules');
  });
  it('does not turn ordinary words into characters', () => {
    expect(bible.characters.map((c) => c.name)).not.toContain('قرية');
  });
  it('cue words introduce names', () => {
    expect(analyzeStory('كان هناك رجل يدعى سليمان يعيش في الصحراء. وكان سليمان كريما.').characters.map((c) => c.name)).toContain('سليمان');
  });
});

describe('story analysis (English)', () => {
  const bible = analyzeStory('Once upon a time, a girl named Lina lived near the forest. Lina met a fox called Rami. Rami taught Lina to be brave. Moral: courage grows when we help others.');
  it('finds named characters and ignores sentence-initial function words', () => {
    expect(bible.language).toBe('en');
    const names = bible.characters.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['Lina', 'Rami']));
    expect(names).not.toContain('Once');
    expect(names).not.toContain('Moral');
    expect(bible.setting).toBe('forest');
    expect(bible.message).toBe('courage grows when we help others.');
  });
  it('detectLanguage / splitBeats', () => {
    expect(detectLanguage('hello world')).toBe('en');
    expect(detectLanguage('مرحبا بالعالم')).toBe('ar');
    expect(splitBeats('One. Two! Three?\nFour')).toEqual(['One.', 'Two!', 'Three?', 'Four']);
  });
});

describe('buildScenes', () => {
  const bible = analyzeStory('Lina found a map in the library. Lina and Rami followed it to the forest. They crossed the river together. At the end, Lina learned to always share. Moral: sharing makes every journey easier.', { language: 'en' });
  it('scene durations equal the requested total, with ordered phases', () => {
    const scenes = buildScenes(bible, 150);
    expect(scenes.reduce((n, s) => n + s.duration, 0)).toBe(150);
    expect(scenes[0]!.phase).toBe('opening');
    expect(scenes.at(-1)!.phase).toBe('ending');
    expect(new Set(scenes.map((s) => s.id)).size).toBe(scenes.length);
  });
  it('every prompt carries the character bible, setting, message and the identity guard', () => {
    for (const s of buildScenes(bible, 60)) {
      expect(s.prompt).toContain('identity locked');
      expect(s.prompt).toContain('THEME: sharing makes every journey easier.');
      expect(s.prompt).toContain('Keep each character identical');
      expect(s.prompt).toContain('No on-screen text');
    }
  });
  it('a scene lists only the characters its beat mentions (falls back to the lead)', () => {
    const scenes = buildScenes(bible, 120);
    const withRami = scenes.filter((s) => s.beat.includes('Rami'));
    expect(withRami.length).toBeGreaterThan(0);
    for (const s of withRami) expect(s.characters).toContain('Rami');
    for (const s of scenes) expect(s.characters.length).toBeGreaterThan(0);
  });
  it('chains scenes that continue the same beat and cuts at a new beat', () => {
    const scenes = buildScenes(bible, 120);
    expect(scenes[0]!.continuity).toBe('fresh');
    for (let i = 1; i < scenes.length; i++) expect(scenes[i]!.continuity).toBe(scenes[i]!.beatIndex === scenes[i - 1]!.beatIndex ? 'chain' : 'fresh');
  });
  it('works for a very short video and an empty story', () => {
    expect(buildScenes(bible, 2)).toHaveLength(1);
    expect(buildScenes(bible, 0)).toEqual([]);
    expect(buildScenes(analyzeStory('x '), 10).length).toBeGreaterThan(0);
  });
});

describe('English heuristics – common story openings', () => {
  it('the protagonist introduced as the first word is found; sentence adverbs and headings are not names', () => {
    const b = analyzeStory('Lina lived near the forest. Suddenly a storm came. Finally she went home. Moral: be kind.');
    expect(b.characters.map((c) => c.name)).toEqual(['Lina']);
  });
  it('a word that only starts later sentences once is not a character', () => {
    expect(analyzeStory('The sun rose. Birds sang. Children played.').characters).toEqual([]);
  });
});
