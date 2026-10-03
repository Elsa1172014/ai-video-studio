import {NextResponse} from 'next/server';
import {z} from 'zod';
const S=z.object({prompt:z.string().min(3),minutes:z.number().min(0.5).max(20),mode:z.enum(['education','series']).default('education'),seriesTitle:z.string().optional(),episodeTitle:z.string().optional(),episodeMemory:z.string().optional(),characters:z.array(z.object({name:z.string(),description:z.string()})).optional()});
function sentences(text:string){return text.replace(/\s+/g,' ').split(/(?<=[.!?؟؛])\s+|\n+/).map(x=>x.trim()).filter(Boolean)}
function clamp(n:number,min:number,max:number){return Math.max(min,Math.min(max,n))}
export async function POST(req:Request){try{
 const x=S.parse(await req.json()),totalSeconds=Math.round(x.minutes*60),story=sentences(x.prompt);
 const target=x.mode==='education'?clamp(Math.round(totalSeconds/25),2,48):clamp(Math.round(totalSeconds/12),4,100),base=Math.floor(totalSeconds/target),remainder=totalSeconds-base*target;
 const cast=(x.characters||[]).filter(c=>c.name.trim()).map(c=>c.name.trim()+': '+c.description.trim()).join(' | ');
 const continuity=(cast?'CHARACTER BIBLE: '+cast+'. ':'')+'Preserve exact character identity, age, facial features, clothing logic, personality and voice across every scene and future episode.';
 const memory=x.episodeMemory?.trim()?'PREVIOUS EPISODE MEMORY: '+x.episodeMemory.trim()+'. Continue from this established canon. Do not contradict completed events, relationships or known facts.':'This is the first recorded episode; establish canon consistently.';
 const educationalRule='EDUCATIONAL MODE: Preserve the supplied teaching content and meaning. Do not invent new facts. Convert the source into clear visual explanation, examples and demonstrations suitable for learners.';
 const scenes=Array.from({length:target},(_,i)=>{const source=story[i%Math.max(1,story.length)]||x.prompt,duration=base+(i<remainder?1:0),progress=(i+0.5)/target,phase=progress<.15?'opening':progress<.75?'development':progress<.92?'climax':'ending';
 const prompt=x.mode==='education'?[educationalRule,'SOURCE LESSON: '+x.prompt,'CURRENT TEACHING BEAT: '+source,'SCENE '+(i+1)+' OF '+target+'.','Visualize this teaching beat accurately with purposeful camera movement and learner-friendly pacing. No unrelated content. No embedded text, subtitles or logos.'].join('\n')
 :['SERIES MODE. SERIES: '+(x.seriesTitle||'Untitled series'),'EPISODE: '+(x.episodeTitle||'Untitled episode'),memory,'CURRENT EPISODE STORY: '+x.prompt,'CURRENT STORY BEAT: '+source,'SCENE '+(i+1)+' OF '+target+' ('+phase+').',continuity,'Maintain cause-and-effect, established relationships, location continuity and cinematic style. Show the beat visually with natural action. No embedded text, subtitles or logos.'].join('\n');
 return{id:crypto.randomUUID(),title:x.mode==='education'?'Learning scene '+(i+1):'Scene '+(i+1)+' · '+phase,sourceText:source,prompt,duration,status:'planned' as const}});
 return NextResponse.json({id:crypto.randomUUID(),title:(x.episodeTitle||x.prompt).slice(0,55),prompt:x.prompt,mode:x.mode,seriesTitle:x.seriesTitle,episodeTitle:x.episodeTitle,episodeMemory:x.episodeMemory,characters:x.characters||[],minutes:x.minutes,totalSeconds,createdAt:new Date().toISOString(),scenes});
}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Planning failed'},{status:400})}}
