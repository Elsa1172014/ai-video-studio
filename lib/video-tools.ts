import {z} from 'zod';

/** Cinematic finishing options — mirrors worker/finish.py FinishOptions. */
export const TRANSITIONS = ['none','fade','dissolve','wipe-left','wipe-right','wipe-up','wipe-down'] as const;
export const GRADES = ['none','cinematic','warm','cool','vintage','noir'] as const;

const card = z.object({title: z.string().trim().min(1).max(120), subtitle: z.string().max(200).default(''), duration: z.number().min(1.5).max(10).default(3.5)});
const mediaUrl = z.string().trim().url().refine(u => /^https?:\/\//i.test(u), 'Must be an http(s) URL');

export const FinishSchema = z.object({
  aspect: z.enum(['16:9','9:16']).default('16:9'),
  transition: z.enum(TRANSITIONS).default('dissolve'),
  transitionDuration: z.number().min(0.2).max(2).default(0.6),
  grade: z.enum(GRADES).default('cinematic'),
  vignette: z.number().min(0).max(1).default(0.35),
  grain: z.number().min(0).max(0.15).default(0.02),
  letterbox: z.boolean().default(false),
  fade: z.number().min(0).max(3).default(0.8),
  titleCard: card.nullish(),
  endCard: card.nullish(),
  captions: z.array(z.string().max(400).nullable()).max(400).nullish(),
  captionSize: z.number().int().min(0).max(96).default(0),
  music: mediaUrl.nullish(),
  musicVolume: z.number().min(0).max(1.5).default(0.25),
  voice: mediaUrl.nullish(),
});
export type FinishOptions = z.infer<typeof FinishSchema>;

/** UI state: everything optional is kept as editable strings/toggles, then compiled with buildFinish(). */
export type FinishSettings = {
  preset: PresetId;
  aspect: '16:9'|'9:16';
  transition: typeof TRANSITIONS[number];
  transitionDuration: number;
  grade: typeof GRADES[number];
  vignette: number;
  grain: number;
  letterbox: boolean;
  fade: number;
  titleOn: boolean; title: string; titleSubtitle: string;
  endOn: boolean; endTitle: string; endSubtitle: string;
  captionsOn: boolean;
  music: string; musicVolume: number;
  voice: string;
};

export type PresetId = 'cinematic'|'documentary'|'classroom'|'vertical'|'noir'|'raw';

export const PRESETS: Record<PresetId,{label:string;hint:string;values:Partial<FinishSettings>}> = {
  cinematic:  {label:'Cinematic film', hint:'2.39:1 letterbox, teal-gold grade, soft grain, dissolves', values:{aspect:'16:9',transition:'dissolve',transitionDuration:0.7,grade:'cinematic',vignette:0.35,grain:0.02,letterbox:true,fade:0.8}},
  documentary:{label:'Documentary',    hint:'Natural warm grade, gentle fades, no bars',               values:{aspect:'16:9',transition:'fade',transitionDuration:0.6,grade:'warm',vignette:0.2,grain:0.01,letterbox:false,fade:0.6}},
  classroom:  {label:'Classroom clear',hint:'Clean picture, large captions, quick cuts — for lessons',  values:{aspect:'16:9',transition:'dissolve',transitionDuration:0.4,grade:'none',vignette:0,grain:0,letterbox:false,fade:0.4}},
  vertical:   {label:'Reels / Shorts', hint:'9:16 vertical, punchy wipes, social-ready',                values:{aspect:'9:16',transition:'wipe-left',transitionDuration:0.35,grade:'cool',vignette:0.25,grain:0,letterbox:false,fade:0.3}},
  noir:       {label:'Noir',           hint:'Black & white drama with heavy vignette',                  values:{aspect:'16:9',transition:'fade',transitionDuration:0.8,grade:'noir',vignette:0.55,grain:0.03,letterbox:true,fade:1}},
  raw:        {label:'Raw join',       hint:'Straight cuts, no finishing (fastest)',                    values:{transition:'none',grade:'none',vignette:0,grain:0,letterbox:false,fade:0,titleOn:false,endOn:false,captionsOn:false}},
};

/** Cut at a word boundary so a long project title never ends mid-word on the title card. */
export function cardTitle(text: string, max = 48): string {
  const clean = text.replace(/\s+/g, ' ').trim().replace(/[.،,:؛!؟?]+$/, '');
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.5 ? cut.slice(0, space) : clean.slice(0, max)).trim();
}

export function defaultFinish(rawTitle = ''): FinishSettings {
  const title = cardTitle(rawTitle);
  return {
    preset:'cinematic', aspect:'16:9', transition:'dissolve', transitionDuration:0.7, grade:'cinematic', vignette:0.35, grain:0.02,
    letterbox:true, fade:0.8, titleOn:Boolean(title), title, titleSubtitle:'', endOn:false, endTitle:'', endSubtitle:'',
    captionsOn:true, music:'', musicVolume:0.25, voice:'',
  };
}

export function applyPreset(current: FinishSettings, id: PresetId): FinishSettings {
  return {...current, ...PRESETS[id].values, preset:id};
}

/** True when a raw join is enough and the worker can skip the finishing pipeline. */
export function isRaw(s: FinishSettings) {
  return s.transition==='none' && s.grade==='none' && !s.vignette && !s.grain && !s.letterbox && !s.fade
    && !(s.titleOn&&s.title.trim()) && !(s.endOn&&s.endTitle.trim()) && !s.captionsOn && !s.music.trim() && !s.voice.trim() && s.aspect==='16:9';
}

/** Compile UI settings into the worker payload. Captions come from each scene's source text. */
export function buildFinish(s: FinishSettings, sceneTexts: (string|undefined)[]): FinishOptions|undefined {
  if (isRaw(s)) return undefined;
  return FinishSchema.parse({
    aspect:s.aspect, transition:s.transition, transitionDuration:s.transitionDuration, grade:s.grade,
    vignette:s.vignette, grain:s.grain, letterbox:s.letterbox, fade:s.fade,
    titleCard: s.titleOn&&s.title.trim() ? {title:s.title.trim().slice(0,120), subtitle:s.titleSubtitle.trim().slice(0,200), duration:3.5} : null,
    endCard: s.endOn&&s.endTitle.trim() ? {title:s.endTitle.trim().slice(0,120), subtitle:s.endSubtitle.trim().slice(0,200), duration:3} : null,
    captions: s.captionsOn ? sceneTexts.map(t => t?.trim() ? t.trim().slice(0,400) : null) : null,
    music: s.music.trim()||null, musicVolume:s.musicVolume, voice: s.voice.trim()||null,
  });
}
