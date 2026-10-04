// Deterministic storyboard planner (also the fallback for the LLM director).
// Groups the source into content-driven scenes of ~10-60 s using estimated speech time,
// never drops source text, and splits each scene into GPU-sized shots.
import type {Character, DialogueLine, Language, Mode, Scene, Shot, Storyboard} from '@/lib/types';

export const MIN_SCENE = 10;
export const MAX_SCENE = 60;
const WPS: Record<Language, number> = {ar: 2.0, en: 2.5}; // spoken words per second

export function detectLanguage(text: string): Language {
  const ar = (text.match(/[؀-ۿ]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return ar >= latin ? 'ar' : 'en';
}

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
export const speechSeconds = (t: string, lang: Language) => (t.trim() ? words(t) / WPS[lang] + 0.4 : 0);

type Unit = {text: string; para: number; dialogue?: DialogueLine; est: number};

function units(text: string, lang: Language, characters: Pick<Character, 'id' | 'name'>[], mode: Mode): Unit[] {
  const out: Unit[] = [];
  const paras = text.replace(/\r/g, '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  paras.forEach((p, para) => {
    for (const line of p.split('\n').map(l => l.trim()).filter(Boolean)) {
      const m = mode === 'series' ? line.match(/^([^:：\n]{1,40})\s*[:：]\s*(.+)$/) : null;
      const speaker = m && characters.find(c => c.name.trim().toLowerCase() === m[1].trim().toLowerCase());
      if (m && (speaker || /^[\p{Lu}؀-ۿ][\p{L}\s'-]{0,30}$/u.test(m[1].trim()))) {
        const d: DialogueLine = {speaker: speaker?.name || m[1].trim(), speakerId: speaker?.id, text: m[2].trim()};
        out.push({text: line, para, dialogue: d, est: speechSeconds(d.text, lang) + 0.5});
        continue;
      }
      const sentences = line.split(/(?<=[.!?؟؛…])\s+/).map(s => s.trim()).filter(Boolean);
      for (const s of sentences) out.push({text: s, para, est: Math.max(speechSeconds(s, lang), mode === 'series' ? 3 : 1.5)});
    }
  });
  return out;
}

/** Integer durations within [min,max] summing to `total` where possible, each >= floor. */
export function fitDurations(est: number[], total: number, min = MIN_SCENE, max = MAX_SCENE): number[] {
  const n = est.length;
  if (!n) return [];
  const floors = est.map(e => Math.min(max, Math.max(min, Math.ceil(e))));
  const sumEst = est.reduce((a, b) => a + b, 0) || 1;
  const d = est.map((e, i) => Math.min(max, Math.max(floors[i], Math.round((e / sumEst) * total))));
  let diff = total - d.reduce((a, b) => a + b, 0);
  for (let guard = 0; diff !== 0 && guard < 100000; guard++) {
    let moved = false;
    for (let i = 0; i < n && diff !== 0; i++) {
      if (diff > 0 && d[i] < max) {d[i]++; diff--; moved = true;}
      else if (diff < 0 && d[i] > floors[i]) {d[i]--; diff++; moved = true;}
    }
    if (!moved) break;
  }
  return d;
}

export function splitShots(duration: number, maxShot: number): number[] {
  const n = Math.max(1, Math.ceil(duration / maxShot));
  const base = Math.floor(duration / n);
  return Array.from({length: n}, (_, i) => base + (i < duration - base * n ? 1 : 0));
}

const titleFrom = (t: string) => {
  const w = t.replace(/^[^:：]{1,40}[:：]\s*/, '').split(/\s+/).slice(0, 7).join(' ');
  return w.length < t.length ? w + '…' : w;
};

export type PlanInput = {
  mode: Mode;
  text: string;
  minutes: number;
  language?: Language;
  characters?: Pick<Character, 'id' | 'name'>[];
};

/** Scenes without shot prompts; call `attachShots` (lib/prompts) to finish them. */
export function planScenes(x: PlanInput): Omit<Storyboard, 'createdAt'> {
  const lang = x.language || detectLanguage(x.text);
  const cast = x.characters || [];
  const total = Math.round(x.minutes * 60);
  const us = units(x.text, lang, cast, x.mode);
  const warnings: string[] = [];
  if (!us.length) return {planner: 'deterministic', totalSeconds: 0, narrationSeconds: 0, warnings: ['No usable text'], scenes: []};

  const estTotal = us.reduce((a, u) => a + u.est, 0);
  const avg = x.mode === 'education' ? 30 : 20;
  const count = Math.max(1, Math.min(Math.floor(total / MIN_SCENE) || 1, Math.round(total / avg) || 1, us.length));
  const ideal = Math.min(MAX_SCENE, Math.max(MIN_SCENE, total / count));
  const scale = Math.max(1, total / estTotal); // short source -> more visual time per beat

  const groups: Unit[][] = [];
  let cur: Unit[] = [], acc = 0;
  us.forEach(u => {
    const t = u.est * scale;
    const slotsLeft = count - groups.length - 1 > 0;
    const paraBreak = cur.length > 0 && u.para !== cur[cur.length - 1].para && acc >= ideal * 0.6;
    // The scene count is a target; the 60 s ceiling is not.
    if (cur.length && (acc + t > MAX_SCENE || (slotsLeft && (acc >= ideal || paraBreak)))) {
      groups.push(cur); cur = []; acc = 0;
    }
    cur.push(u); acc += t;
  });
  if (cur.length) groups.push(cur);

  const narrationSeconds = Math.round(estTotal);
  const ests = groups.map(g => g.reduce((a, u) => a + u.est, 0));
  const durations = fitDurations(ests, total);
  const sum = durations.reduce((a, b) => a + b, 0);
  if (sum > total + 5) warnings.push(`The text needs about ${Math.ceil(sum / 60)} min to narrate; the target was ${x.minutes} min. Nothing was cut.`);
  if (estTotal < total * 0.5 && x.mode === 'education') warnings.push('The source is short for this length; scenes include extra visual pacing but no added facts.');

  const scenes: Scene[] = groups.map((g, i) => {
    const dialogue = g.flatMap(u => (u.dialogue ? [u.dialogue] : []));
    const prose = g.filter(u => !u.dialogue).map(u => u.text).join(' ');
    const sourceText = g.map(u => u.text).join(x.mode === 'series' ? '\n' : ' ');
    const mentioned = cast.filter(c => c.name.trim() && (sourceText.toLowerCase().includes(c.name.trim().toLowerCase()) || dialogue.some(d => d.speakerId === c.id)));
    const progress = (i + 0.5) / groups.length;
    return {
      id: crypto.randomUUID(),
      index: i,
      title: titleFrom(g[0].text),
      phase: x.mode === 'series' ? (progress < 0.15 ? 'opening' : progress < 0.75 ? 'development' : progress < 0.92 ? 'climax' : 'resolution') : 'teaching beat',
      sourceText,
      narration: x.mode === 'education' ? sourceText : prose,
      dialogue,
      visual: prose || dialogue.map(d => `${d.speaker} speaks: ${d.text}`).join(' '),
      characterIds: mentioned.map(c => c.id),
      duration: durations[i],
      shots: [],
    };
  });
  return {planner: 'deterministic', totalSeconds: sum, narrationSeconds, warnings, scenes};
}

export const _test = {units};
export type {Shot};
