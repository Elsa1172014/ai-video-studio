import type {Character, Scene, Storyboard} from './types';
export type FilmFormat = 'explainer' | 'story' | 'dialogue';
export type FilmBeat = {id:string; sourceText:string; idea:string; narration:string; evidence:string[]; visual:string; duration:number; characterIds:string[]; speakerId?:string};
export type FilmDirection = {format:FilmFormat; method:'motion'|'cinematic'; style:string; execution:string; music:'none'|'ambient'|'cinematic'|'upload'; musicUrl?:string; musicVolume:number; characters:Character[]; beats:FilmBeat[]};
export const wordCount = (s:string) => s.trim().split(/\s+/).filter(Boolean).length;
export function allocateSeconds(weights:number[], seconds:number) {
  if (!weights.length) return [];
  if (seconds < weights.length * 5) throw new Error(`هذه الأفكار تحتاج ${weights.length*5} ثانية على الأقل. ادمج بعض الفقرات أو زد المدة.`);
  const remaining=seconds-weights.length*5, sum=weights.reduce((a,b)=>a+b,0)||1;
  const raw=weights.map(w=>remaining*w/sum), result=raw.map(n=>5+Math.floor(n));
  let extra=seconds-result.reduce((a,b)=>a+b,0);
  for(const {i} of raw.map((n,i)=>({i,f:n-Math.floor(n)})).sort((a,b)=>b.f-a.f)) {if(extra--<=0)break;result[i]++;}
  return result;
}
export function suggestDirection(text:string, seconds:number):FilmDirection {
  const paragraphs=text.split(/\n\s*\n|\n/).map(s=>s.trim()).filter(Boolean);
  const groups=paragraphs.length?paragraphs:[text];
  const durations=allocateSeconds(groups.map(wordCount),Math.max(seconds,groups.length*5));
  const story=/قال|قالت|شخصية|بطل|حكاية|قصة/.test(text), dialogue=/^[^\n:]{2,30}:\s/m.test(text);
  const format:FilmFormat=dialogue?'dialogue':story?'story':'explainer';
  const names=[...new Set([...text.matchAll(/^([^\n:]{2,30}):\s/gm)].map(m=>m[1].trim()))].slice(0,12);
  if (!names.length && /طفل/.test(text)) names.push('الطفل');
  const characters:Character[]=names.map((name,i)=>({id:crypto.randomUUID(),seriesId:'education',name,role:i?'داعمة':'رئيسة',appearance:'شخصية توضيحية مقترحة؛ عدّل ملامحها وأضف صورتها',voice:{provider:'tts',voiceId:'ar-AE-HamdanNeural'},locked:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));
  return {format,method:'motion',style:'تعليمي بصري واضح، ألوان سينمائية، انتقالات هادئة',execution:'فكرة واحدة لكل مشهد؛ إظهار الدليل مع تفسيره، ثم سؤال تفكير في النهاية.',music:'none',musicVolume:0.12,characters,beats:groups.map((sourceText,i)=>{
    const sentences=sourceText.split(/(?<=[.!؟?؛])\s+/).filter(Boolean);
    const evidence=sentences.filter(s=>/[0-9٠-٩]|دليل|لأن|بسبب|نتيجة|قال|تقول|أثبت/.test(s));
    return {id:crypto.randomUUID(),sourceText,idea:sentences[0]||sourceText,narration:sourceText,evidence,visual:evidence.length?'إظهار الدليل بصريًا وربطه بالفكرة والنتيجة، مع إبراز الأرقام دون تغييرها.':'توضيح الفكرة بمشهد مرتبط بالنص وصورة رئيسة وحركة هادئة.',duration:durations[i],characterIds:characters.filter(c=>sourceText.includes(c.name)).map(c=>c.id),speakerId:characters.find(c=>sourceText.startsWith(c.name+':'))?.id};
  })};
}
export function directedBoard(direction:FilmDirection, seconds:number):Omit<Storyboard,'createdAt'> {
  if(!direction.beats.length)throw new Error('أضف فكرة واحدة على الأقل.');
  const sum=direction.beats.reduce((n,b)=>n+b.duration,0);
  if(sum!==seconds)throw new Error(`مجموع مدد المشاهد ${sum} ثانية؛ المطلوب ${seconds}. اضغط توزيع الوقت.`);
  const scenes:Scene[]=direction.beats.map((b,i)=>{
    if(wordCount(b.narration)>Math.floor(b.duration*1.8))throw new Error(`تعليق المشهد ${i+1} طويل. اختصره مع إبقاء الفكرة والدليل، أو أعد توزيع الوقت.`);
    const speaker=direction.characters.find(c=>c.id===b.speakerId);
    return {id:crypto.randomUUID(),index:i,title:b.idea.slice(0,160),sourceText:b.sourceText,narration:speaker?'':b.narration,dialogue:speaker?[{speaker:speaker.name,speakerId:speaker.id,text:b.narration}]:[],visual:b.visual,characterIds:b.characterIds,duration:b.duration,shots:[],idea:b.idea,evidence:b.evidence};
  });
  return {planner:'deterministic',totalSeconds:seconds,narrationSeconds:Math.ceil(direction.beats.reduce((n,b)=>n+wordCount(b.narration),0)/1.8),warnings:[],scenes};
}
