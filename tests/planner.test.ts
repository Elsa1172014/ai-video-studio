import {describe, expect, it} from 'vitest';
import {detectLanguage, fitDurations, planScenes, splitShots} from '@/lib/planner';
import {attachShots, continuityDigest} from '@/lib/prompts';
import type {Character, Episode} from '@/lib/types';

const lesson = `الماء يغلي عند مئة درجة مئوية عند مستوى سطح البحر. عندما يسخن الماء تتحرك جزيئاته بسرعة أكبر.

يتحول الماء السائل إلى بخار في عملية تسمى التبخر. يحدث التكاثف عندما يبرد البخار ويعود سائلاً.

تتكرر هذه العمليات في الطبيعة وتشكل دورة الماء. الشمس هي مصدر الطاقة الرئيسي لهذه الدورة.`;

const sentences = (t: string) => t.split(/(?<=[.!?؟؛])\s+|\n+/).map(s => s.trim()).filter(Boolean);

describe('planner', () => {
  it('detects language', () => {
    expect(detectLanguage(lesson)).toBe('ar');
    expect(detectLanguage('Water boils at 100 degrees.')).toBe('en');
  });

  it('never drops or rewrites educational source text', () => {
    for (const minutes of [0.5, 1, 3, 10]) {
      const b = planScenes({mode: 'education', text: lesson, minutes});
      const narrated = b.scenes.map(s => s.narration).join(' ');
      for (const s of sentences(lesson)) expect(narrated).toContain(s);
      for (const s of b.scenes) expect(s.dialogue).toEqual([]);
    }
  });

  it('keeps scenes within 10-60 s and near the target length', () => {
    const b = planScenes({mode: 'education', text: lesson, minutes: 3});
    for (const s of b.scenes) {expect(s.duration).toBeGreaterThanOrEqual(10); expect(s.duration).toBeLessThanOrEqual(60);}
    expect(b.totalSeconds).toBe(180);
  });

  it('warns instead of cutting when the text is longer than the target', () => {
    const long = Array.from({length: 60}, (_, i) => `This is sentence number ${i} of a long lesson about the water cycle and evaporation in nature.`).join(' ');
    const b = planScenes({mode: 'education', text: long, minutes: 0.5});
    expect(b.warnings.join(' ')).toMatch(/Nothing was cut/);
    expect(b.scenes.map(s => s.narration).join(' ')).toContain('sentence number 59');
  });

  it('extracts dialogue and maps speakers to characters in series mode', () => {
    const cast = [{id: 'c1', name: 'Omar'}, {id: 'c2', name: 'Mariam'}];
    const b = planScenes({mode: 'series', minutes: 1, characters: cast, text: 'Omar runs into the old library.\nOmar: Did you hear that?\nMariam: It came from the basement!\nThey walk down the stairs together.'});
    const lines = b.scenes.flatMap(s => s.dialogue);
    expect(lines).toEqual([
      {speaker: 'Omar', speakerId: 'c1', text: 'Did you hear that?'},
      {speaker: 'Mariam', speakerId: 'c2', text: 'It came from the basement!'},
    ]);
    expect(b.scenes.flatMap(s => s.characterIds)).toEqual(expect.arrayContaining(['c1', 'c2']));
  });

  it('fits durations and splits shots', () => {
    expect(fitDurations([5, 5, 5], 60).reduce((a, b) => a + b)).toBe(60);
    expect(fitDurations([100], 30)).toEqual([60]);
    expect(splitShots(25, 10)).toEqual([9, 8, 8]);
    expect(splitShots(10, 10)).toEqual([10]);
  });
});

describe('prompts', () => {
  const omar: Character = {id: 'c1', seriesId: 's', name: 'Omar', appearance: 'round face, brown eyes', age: '12', wardrobe: 'white kandura', negativeConstraints: 'no glasses', referenceImage: {url: 'https://x.public.blob.vercel-storage.com/o.jpg', durable: true}, locked: true, createdAt: '', updatedAt: ''};

  it('injects locked character identity and reference image into every shot', () => {
    const b = planScenes({mode: 'series', minutes: 1, characters: [omar], text: 'Omar opens the door.\nOmar: Hello?'});
    const sb = attachShots(b, {mode: 'series', aspectRatio: '16:9', characters: [omar], continuity: 'Episode 1 ended in the library.', maxShotSeconds: 10});
    for (const s of sb.scenes) {
      expect(s.referenceImageUrl).toBe(omar.referenceImage!.url);
      for (const sh of s.shots) {
        expect(sh.prompt).toContain('white kandura');
        expect(sh.prompt).toContain('never: no glasses');
        expect(sh.prompt).toContain('Episode 1 ended in the library');
        expect(sh.duration).toBeLessThanOrEqual(10);
      }
      expect(s.shots.reduce((a, x) => a + x.duration, 0)).toBe(s.duration);
    }
  });

  it('bounds continuity and prioritises the latest episode', () => {
    const mem = (n: number) => ({summary: `Summary ${n} `.repeat(30), unresolvedThreads: [`thread ${n}`], events: [], characterStates: [{name: 'Omar', state: `state ${n}`}], relationshipChanges: [], locations: [], wardrobeProps: [], acquired: [], finalSceneState: `end ${n}`, nextEpisodeNotes: `notes ${n}`, source: 'manual' as const, savedAt: ''});
    const eps = [1, 2, 3, 4, 5].map(n => ({id: String(n), seriesId: 's', number: n, title: '', goal: '', minutes: 1, aspectRatio: '16:9' as const, memory: mem(n), createdAt: '', updatedAt: ''})) as Episode[];
    const d = continuityDigest(eps, [omar], 1500);
    expect(d.length).toBeLessThanOrEqual(1500);
    expect(d).toContain('Previously (episode 5)');
    expect(d).toContain('end 5');
    expect(d).toContain('state 5');
    expect(d).toContain('thread 1');
  });
});
