import {NextResponse} from 'next/server';
import {z} from 'zod';

const S=z.object({prompt:z.string().min(3),minutes:z.number().min(0.5).max(20)});

function sentences(text:string){
 return text.replace(/\s+/g,' ').split(/(?<=[.!?؟؛])\s+|\n+/).map(x=>x.trim()).filter(Boolean);
}

export async function POST(req:Request){
 try{
  const x=S.parse(await req.json());
  const totalSeconds=Math.round(x.minutes*60);
  const sceneDuration=5;
  const count=Math.max(6,Math.min(240,Math.ceil(totalSeconds/sceneDuration)));
  const story=sentences(x.prompt);
  const continuity='Keep the same main characters, facial identity, age, clothing, locations, lighting logic and cinematic visual style throughout the whole story. Do not introduce unrelated people, objects or events.';
  const scenes=Array.from({length:count},(_,i)=>{
   const source=story[i%Math.max(1,story.length)]||x.prompt;
   const previous=i>0?(story[(i-1)%Math.max(1,story.length)]||''):'';
   const duration=i===count-1?Math.max(3,totalSeconds-sceneDuration*(count-1)):sceneDuration;
   const progress=(i+0.5)/count;
   const phase=progress<0.2?'opening':progress<0.65?'development':progress<0.9?'climax':'ending';
   const prompt=[
    'STORY CONTEXT: '+x.prompt,
    'CURRENT STORY BEAT: '+source,
    previous?'PREVIOUS BEAT: '+previous:'',
    'SCENE '+(i+1)+' OF '+count+' ('+phase+').',
    'Show the CURRENT STORY BEAT literally and visually. Preserve narrative cause and effect from the previous scene.',
    continuity,
    'Cinematic composition, natural motion, clear subject action, no text, no subtitles, no logos.'
   ].filter(Boolean).join('\n');
   return {id:crypto.randomUUID(),title:'Scene '+(i+1)+' · '+phase,sourceText:source,prompt,duration,status:'planned' as const};
  });
  return NextResponse.json({id:crypto.randomUUID(),title:x.prompt.slice(0,55),prompt:x.prompt,minutes:x.minutes,totalSeconds,sceneDuration,createdAt:new Date().toISOString(),scenes});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:'Story planning failed'},{status:400});
 }
}
