import { planDurations } from './planner';

export type Lang = 'ar' | 'en';
export type Phase = 'opening' | 'development' | 'climax' | 'ending';

export interface Character {
  id: string;
  name: string;
  description: string;
  /** Public image URL used as visual conditioning for this character's scenes. */
  imageUrl?: string;
}

export interface StoryBible {
  title: string;
  language: Lang;
  /** The moral / message the story must deliver. */
  message: string;
  tone: string;
  setting: string;
  /** Visual style appended to every scene prompt. */
  style: string;
  characters: Character[];
  /** Story broken into ordered beats. */
  beats: string[];
  /** How the bible was produced: heuristics only, or refined by a language model. */
  analysis: 'rules' | 'llm';
}

export interface StoryScene {
  id: string;
  index: number;
  title: string;
  phase: Phase;
  beat: string;
  beatIndex: number;
  /** Names of the characters appearing in this scene. */
  characters: string[];
  prompt: string;
  duration: number;
  /** `chain`: continues the previous scene's action, starts from its last frame. `fresh`: a cut, anchored to the character reference. */
  continuity: 'chain' | 'fresh';
}

const ARABIC = /[؀-ۿ]/g;
export function detectLanguage(text: string): Lang {
  const ar = (text.match(ARABIC) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return ar >= latin ? 'ar' : 'en';
}

export function splitBeats(text: string): string[] {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?؟؛。])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 1);
}

// ---- Character detection (heuristics; an optional language model refines the result) ----

const AR_NAMES = ['محمد', 'أحمد', 'احمد', 'علي', 'عمر', 'عثمان', 'خالد', 'يوسف', 'إبراهيم', 'ابراهيم', 'إسماعيل', 'اسماعيل', 'حسن', 'حسين', 'سعيد', 'سالم', 'ماجد', 'فهد', 'راشد', 'سلطان', 'زايد', 'حمدان', 'ناصر', 'طارق', 'زياد', 'كريم', 'عادل', 'سامي', 'وليد', 'هاني', 'بلال', 'أنس', 'انس', 'آدم', 'ادم', 'نوح', 'موسى', 'عيسى', 'يحيى', 'زكريا', 'مصطفى', 'ياسر', 'فيصل', 'عبدالله', 'عبدالرحمن', 'مريم', 'فاطمة', 'عائشة', 'خديجة', 'زينب', 'سارة', 'ليلى', 'سلمى', 'هدى', 'نور', 'نورة', 'ريم', 'لينا', 'دانة', 'هند', 'منى', 'رنا', 'دعاء', 'آمنة', 'امنة', 'أسماء', 'اسماء', 'سمية', 'رقية', 'جنى', 'لمى', 'ياسمين', 'شيماء', 'ريما', 'حلا', 'تالا', 'جود', 'ملك', 'رهف', 'غادة', 'بشرى', 'أمل', 'امل'];
const AR_CUES = /(?:اسمه|اسمها|يدعى|تدعى|يُدعى|تُدعى|يسمى|تسمى|يُسمّى|تُسمّى|المدعو|المدعوة)\s+([ء-ي]{2,})/g;
const AR_ROLES: Record<string, string> = { الطفل: 'طفل', الطفلة: 'طفلة', الولد: 'ولد', البنت: 'بنت', الفتى: 'فتى', الفتاة: 'فتاة', الأستاذ: 'أستاذ', الاستاذ: 'أستاذ', الأستاذة: 'أستاذة', الاستاذة: 'أستاذة', الدكتور: 'دكتور', الدكتورة: 'دكتورة', الشيخ: 'شيخ', المعلم: 'معلم', المعلمة: 'معلمة', الجد: 'جد', الجدة: 'جدة', الأب: 'أب', الأم: 'أم', الملك: 'ملك', الملكة: 'ملكة', الأمير: 'أمير', الأميرة: 'أميرة' };
const AR_ROLE_CUE = new RegExp(`(${Object.keys(AR_ROLES).join('|')})\\s+([\\u0621-\\u064A]{2,})`, 'g');

const EN_STOP = new Set(['The', 'A', 'An', 'In', 'On', 'At', 'And', 'But', 'Or', 'So', 'Then', 'When', 'While', 'After', 'Before', 'One', 'Once', 'It', 'He', 'She', 'They', 'We', 'I', 'You', 'His', 'Her', 'Their', 'This', 'That', 'There', 'Here', 'As', 'If', 'With', 'Without', 'From', 'To', 'Of', 'For', 'By', 'Every', 'Each', 'Some', 'Many', 'All', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Mr', 'Mrs', 'Ms', 'Dr', 'Meanwhile', 'However', 'Finally', 'Today', 'Tomorrow', 'Yesterday', 'Later', 'Soon', 'Now', 'Maybe', 'Perhaps', 'Inside', 'Outside', 'Behind', 'Together', 'Sometimes', 'Often', 'Always', 'Never', 'Everyone', 'Nobody', 'Someone', 'Nothing', 'Everything', 'Moral', 'Lesson', 'Message', 'Suddenly', 'Morning', 'Evening', 'Night', 'Long']);
const EN_ROLES = ['boy', 'girl', 'man', 'woman', 'teacher', 'doctor', 'king', 'queen', 'prince', 'princess', 'grandfather', 'grandmother', 'father', 'mother', 'student', 'farmer', 'child'];

const stripAr = (w: string) => w.replace(/^[وفبل]{1}(?=[ء-ي]{3,})/, '');
export const idOf = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'character';

function describe(name: string, beats: string[], lang: Lang, role?: string): string {
  const hint = beats.find((b) => b.includes(name));
  const age = hint && (/(\d{1,2})\s*(?:years?|yo|سنة|سنوات|عام|عاماً)/i.exec(hint)?.[1] ?? undefined);
  const roleText = role ?? (lang === 'en' ? EN_ROLES.find((r) => hint && new RegExp(`\\b${r}\\b`, 'i').test(hint)) : undefined);
  const parts = [roleText, age ? (lang === 'ar' ? `${age} سنة` : `${age} years old`) : undefined].filter(Boolean);
  const base = parts.length ? parts.join(', ') : lang === 'ar' ? 'شخصية رئيسية في القصة' : 'a main character of the story';
  return `${base}. ${lang === 'ar' ? 'يحافظ على الملامح والملابس نفسها في كل مشهد' : 'same face, hair and clothing in every scene'}`;
}

export function detectCharacters(text: string, beats: string[], lang: Lang): Character[] {
  const counts = new Map<string, { n: number; role?: string }>();
  const bump = (name: string, role?: string, weight = 1) => {
    const cur = counts.get(name) ?? { n: 0, role };
    cur.n += weight;
    cur.role ??= role;
    counts.set(name, cur);
  };
  if (lang === 'ar') {
    for (const m of text.matchAll(AR_CUES)) bump(m[1]!);
    for (const m of text.matchAll(AR_ROLE_CUE)) bump(m[2]!, AR_ROLES[m[1]!]);
    const names = new Set(AR_NAMES);
    for (const w of text.split(/[^ء-ي]+/)) {
      if (!w) continue;
      const base = names.has(w) ? w : names.has(stripAr(w)) ? stripAr(w) : undefined;
      if (base) bump(base);
    }
  } else {
    for (const m of text.matchAll(/\b(?:named|called)\s+([A-Z][a-z]+)/g)) bump(m[1]!, undefined, 2);
    beats.forEach((sentence, s) => {
      const words = sentence.split(/\s+/);
      words.forEach((raw, i) => {
        const w = raw.replace(/[^A-Za-z]/g, '');
        if (w.length < 2 || !/^[A-Z][a-z]+$/.test(w) || EN_STOP.has(w) || /ly$/.test(w)) return;
        // A capital inside a sentence is a proper-noun signal on its own. A sentence-initial one needs a second sighting,
        // except the very first word of the story, which is almost always its protagonist.
        bump(w, undefined, i > 0 || s === 0 ? 2 : 1);
      });
    });
  }
  const named = [...counts.entries()].filter(([, v]) => v.n >= (lang === 'en' ? 2 : 1)).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  return named.map(([name, v]) => ({ id: idOf(name), name, description: describe(name, beats, lang, v.role) }));
}

const PLACES_AR = ['مدرسة', 'بيت', 'منزل', 'غابة', 'مدينة', 'قرية', 'صحراء', 'بحر', 'شاطئ', 'حديقة', 'سوق', 'مكتبة', 'قصر', 'جبل', 'نهر', 'مزرعة', 'مستشفى', 'ملعب', 'مسجد', 'مطار', 'فضاء', 'كهف', 'جزيرة'];
const PLACES_EN = ['school', 'house', 'home', 'forest', 'city', 'village', 'desert', 'sea', 'beach', 'garden', 'market', 'library', 'palace', 'castle', 'mountain', 'river', 'farm', 'hospital', 'stadium', 'airport', 'space', 'cave', 'island', 'park'];

export function detectSetting(text: string, lang: Lang): string {
  if (lang === 'ar') {
    const m = new RegExp(`(?:في|إلى|الى|داخل|قرب)\\s+(?:ال)?(${PLACES_AR.join('|')})`).exec(text);
    if (m) return `${m[1]}`;
  } else {
    const m = new RegExp(`\\b(?:in|at|to|inside|near)\\s+(?:the|a|an)?\\s*(${PLACES_EN.join('|')})\\b`, 'i').exec(text);
    if (m) return m[1]!.toLowerCase();
  }
  return lang === 'ar' ? 'مكان يناسب أحداث القصة' : 'a place that fits the story';
}

const TONES: [RegExp, string, string][] = [
  [/مغامر|adventur|explor|اكتشاف|رحلة|journey/i, 'مغامرة وتشويق', 'adventurous and thrilling'],
  [/حزن|حزين|بكى|فقد|sad|cried|lost|grief/i, 'مؤثر وعاطفي', 'emotional and touching'],
  [/ضحك|مضحك|طريف|funny|laugh|joke/i, 'مرح وكوميدي', 'playful and funny'],
  [/خوف|مخيف|ظلام|fear|dark|scary|ghost/i, 'غموض وتوتر', 'mysterious and tense'],
  [/تعلم|درس|معلومة|learn|lesson|science|علم/i, 'تعليمي ودافئ', 'educational and warm'],
];
export function detectTone(text: string, lang: Lang): string {
  const hit = TONES.find(([re]) => re.test(text));
  return hit ? (lang === 'ar' ? hit[1] : hit[2]) : lang === 'ar' ? 'سينمائي دافئ' : 'warm and cinematic';
}

const MORAL = /(?:العبرة|الرسالة|الدرس|الحكمة|moral|lesson|message|the point)\s*[:：-]?\s*(.+)/i;
const LESSONISH = /(تعلم|يجب|دائم|أبد|الصدق|الصبر|التعاون|learn|always|never|honesty|kindness|teamwork|patience)/i;
export function detectMessage(beats: string[]): string {
  for (const b of beats) {
    const m = MORAL.exec(b);
    if (m?.[1]) return m[1].trim();
  }
  const last = beats[beats.length - 1];
  return last && LESSONISH.test(last) ? last : '';
}

/** Model prompts are English regardless of the story's language. */
export const defaultStyle = (): string => 'cinematic film look, natural soft lighting, shallow depth of field, rich colour grading, consistent character design, smooth camera movement, 24fps';

/** Rule-based analysis of a story. Always works offline; `refineWithLlm` (lib/llm.ts) can improve it. */
export function analyzeStory(text: string, opts: { title?: string; language?: Lang } = {}): StoryBible {
  const clean = text.trim();
  const language = opts.language ?? detectLanguage(clean);
  const beats = splitBeats(clean);
  return {
    title: (opts.title?.trim() || beats[0] || clean).slice(0, 60),
    language,
    message: detectMessage(beats),
    tone: detectTone(clean, language),
    setting: detectSetting(clean, language),
    style: defaultStyle(),
    characters: detectCharacters(clean, beats, language),
    beats,
    analysis: 'rules',
  };
}

// ---- Storyboard ----

const SHOTS = ['wide establishing shot', 'medium shot', 'close-up on the face', 'over-the-shoulder shot', 'tracking shot following the action', 'low-angle shot', 'two-shot'];
const phaseOf = (progress: number): Phase => (progress < 0.15 ? 'opening' : progress < 0.75 ? 'development' : progress < 0.92 ? 'climax' : 'ending');

const mentions = (beat: string, name: string) => beat.includes(name);

/** Turns a bible + total duration into scenes whose durations add up exactly to `totalSeconds`. */
export function buildScenes(bible: StoryBible, totalSeconds: number): StoryScene[] {
  const durations = planDurations(totalSeconds);
  const count = durations.length;
  if (!count) return [];
  const beats = bible.beats.length ? bible.beats : [bible.title];
  const cast = bible.characters;
  const lead = cast[0];
  const guard = 'Keep each character identical to the character descriptions in every scene.';
  return durations.map((duration, i) => {
    const beatIndex = Math.min(beats.length - 1, Math.floor((i * beats.length) / count));
    const beat = beats[beatIndex]!;
    const phase = phaseOf((i + 0.5) / count);
    const present = cast.filter((c) => mentions(beat, c.name));
    const inScene = present.length ? present : lead ? [lead] : [];
    const shot = i === 0 ? SHOTS[0]! : phase === 'climax' ? (i % 2 ? SHOTS[2]! : SHOTS[5]!) : SHOTS[(i % (SHOTS.length - 1)) + 1]!;
    const prev = i > 0 ? Math.min(beats.length - 1, Math.floor(((i - 1) * beats.length) / count)) : -1;
    const prompt = [
      `STORY: ${bible.title}. TONE: ${bible.tone}. SETTING: ${bible.setting}.`,
      inScene.length ? `CHARACTERS (identity locked): ${inScene.map((c) => `${c.name} — ${c.description}`).join(' | ')}.` : '',
      bible.message ? `THEME: ${bible.message}.` : '',
      `SCENE ${i + 1} OF ${count} (${phase}). ACTION: ${beat}`,
      `SHOT: ${shot}.`,
      `STYLE: ${bible.style}. ${guard} No on-screen text, subtitles, watermarks or logos.`,
    ].filter(Boolean).join('\n');
    return {
      id: `scene-${i + 1}`,
      index: i,
      title: `${bible.language === 'ar' ? 'مشهد' : 'Scene'} ${i + 1}`,
      phase,
      beat,
      beatIndex,
      characters: inScene.map((c) => c.name),
      prompt,
      duration,
      continuity: i > 0 && prev === beatIndex ? 'chain' : 'fresh',
    };
  });
}
