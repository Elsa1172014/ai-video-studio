import {NextResponse} from 'next/server';
import {z} from 'zod';

const S=z.object({prompt:z.string().min(3),minutes:z.number().min(0.5).max(20),mode:z.enum(['education','series']).default('education')});

function sentences(text:string){return text.replace(/\s+/g,' ').split(/(?<=[.!?؟؛])\s+|\n+/).map(x=>x.trim()).filter(Boolean)}
function chunks(parts:string[],count:number){const out:string[]=[];const size=Math.max(1,Math.ceil(parts.length/count));for(let i=0;i<parts.length;i+=size)out.push(parts.slice(i,i+size).join(' '));return out}
function durations(total:number,count:number){const base=Math.max(10,Math.min(60,Math.round(total/count)));const values=Array.from({length:count},()=>base);let diff=total-values.reduce((a,b)=>a+b,0);let i=0;while(diff!==0&&i<10000){const k=i%count;if(diff>0&&values[k]<60){values[k]++;diff--}else if(diff<0&&values[k]>10){values[k]--;diff++}i++}return values}

export async function POST(req:Request){
 try{
  const x=S.parse(await req.json());const totalSeconds=Math.round(x.minutes*60);
  const target=Math.max(1,Math.round(totalSeconds/30));const source=sentences(x.prompt);const beats=chunks(source,target);
  const count=Math.max(1,Math.min(beats.length,Math.floor(totalSeconds/10)));const selected=beats.slice(0,count);const timing=durations(totalSeconds,count);
  const continuity='LOCK CONTINUITY: keep recurring characters facial identity, age, body proportions, voice identity, wardrobe continuity, locations and cinematic style consistent. Do not redesign a recurring character between scenes.';
  const education='EDUCATIONAL FIDELITY: preserve the supplied educational content and meaning exactly. Do not add unsupported facts, change claims, or replace the source. Visualize and pace the source clearly for learners.';
  const scenes=selected.map((beat,i)=>{const previous=i>0?selected[i-1]:'';const prompt=[x.mode==='education'?education:continuity,'SOURCE / STORY CONTEXT: '+x.prompt,'CURRENT SCENE CONTENT: '+beat,previous?'PREVIOUS SCENE: '+previous:'',x.mode==='series'?'Treat this as part of a continuing episode. Preserve narrative cause and effect and all established character traits.':'Design visuals that directly support the current educational content.','Cinematic composition, natural motion, clear subject action, no logos.'].filter(Boolean).join('\n');return{id:crypto.randomUUID(),title:(x.mode==='education'?'Learning Scene ':'Episode Scene ')+(i+1),sourceText:beat,prompt,duration:timing[i],status:'planned' as const}});
  return NextResponse.json({id:crypto.randomUUID(),title:x.prompt.slice(0,55),prompt:x.prompt,mode:x.mode,minutes:x.minutes,totalSeconds,createdAt:new Date().toISOString(),scenes});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Planning failed'},{status:400})}
}