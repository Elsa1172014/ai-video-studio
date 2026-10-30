import {NextResponse} from 'next/server';
import {z} from 'zod';
const S=z.object({prompt:z.string().min(3),minutes:z.number().min(0.05).max(20).optional(),seconds:z.number().int().min(5).max(1200).optional(),sceneCount:z.number().int().min(1).max(100).optional(),mode:z.enum(['education','series']).default('education'),seriesTitle:z.string().optional(),episodeTitle:z.string().optional(),episodeMemory:z.string().optional(),characters:z.array(z.object({name:z.string(),description:z.string()})).optional()});
function sentences(text:string){return text.replace(/\s+/g,' ').split(/(?<=[.!?؟؛])\s+|\n+/).map(x=>x.trim()).filter(Boolean)}
function clamp(n:number,min:number,max:number){return Math.max(min,Math.min(max,n))}
export async function POST(req:Request){try{
 const x=S.parse(await req.json()),totalSeconds=clamp(Math.round(x.seconds??(x.minutes??1)*60),5,1200),story=sentences(x.prompt);
 // Default: ~8 s per scene (what free video models generate well). The user can set the count explicitly.
 const auto=clamp(Math.round(totalSeconds/8),1,100);
 const target=clamp(x.sceneCount??auto,1,Math.min(100,totalSeconds)),base=Math.floor(totalSeconds/target),remainder=totalSeconds-base*target;
 const cast=(x.characters||[]).filter(c=>c.name.trim()).map(c=>c.name.trim()+': '+c.description.trim()).join(' | ');
 const continuity=(cast?'CHARACTER BIBLE: '+cast+'. ':'')+'Preserve exact character identity, age, facial features, clothing logic, personality and voice across every scene and future episode.';
 const memory=x.episodeMemory?.trim()?'PREVIOUS EPISODE MEMORY: '+x.episodeMemory.trim()+'. Continue from this established canon. Do not contradict completed events, relationships or known facts.':'This is the first recorded episode; establish canon consistently.';
 const educationalRule='EDUCATIONAL MODE: Preserve the supplied teaching content and meaning. Do not invent new facts. Convert the source into clear visual explanation, examples and demonstrations suitable for learners.';
 const scenes=Array.from({length:target},(_,i)=>{const L=story.length,from=Math.floor(i*L/target),to=Math.max(from+1,Math.floor((i+1)*L/target)),source=(L?story.slice(from,Math.min(L,to)).join(' '):'')||x.prompt,duration=base+(i<remainder?1:0),progress=(i+0.5)/target,phase=progress<.15?'opening':progress<.75?'development':progress<.92?'climax':'ending';
 const prompt=x.mode==='education'?[educationalRule,'SOURCE LESSON: '+x.prompt,'CURRENT TEACHING BEAT: '+source,'SCENE '+(i+1)+' OF '+target+'.','Visualize this teaching beat accurately with purposeful camera movement and learner-friendly pacing. No unrelated content. No embedded text, subtitles or logos.'].join('\n')
 :['SERIES MODE. SERIES: '+(x.seriesTitle||'Untitled series'),'EPISODE: '+(x.episodeTitle||'Untitled episode'),memory,'CURRENT EPISODE STORY: '+x.prompt,'CURRENT STORY BEAT: '+source,'SCENE '+(i+1)+' OF '+target+' ('+phase+').',continuity,'Maintain cause-and-effect, established relationships, location continuity and cinematic style. Show the beat visually with natural action. No embedded text, subtitles or logos.'].join('\n');
 return{id:crypto.randomUUID(),title:x.mode==='education'?'المشهد التعليمي '+(i+1):'المشهد '+(i+1)+' · '+({opening:'افتتاح',development:'تصاعد',climax:'ذروة',ending:'خاتمة'} as Record<string,string>)[phase],sourceText:source,prompt,duration,status:'planned' as const}});
 return NextResponse.json({id:crypto.randomUUID(),title:(x.episodeTitle||x.prompt).slice(0,55),prompt:x.prompt,mode:x.mode,seriesTitle:x.seriesTitle,episodeTitle:x.episodeTitle,episodeMemory:x.episodeMemory,characters:x.characters||[],minutes:Math.round(totalSeconds/6)/10,totalSeconds,createdAt:new Date().toISOString(),scenes});
}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'تعذّر بناء المخطط'},{status:400})}}
