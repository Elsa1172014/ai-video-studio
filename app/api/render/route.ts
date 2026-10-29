import {NextResponse} from 'next/server';
import {z} from 'zod';
import {submitRender} from '@/lib/generation';
import {FinishSchema} from '@/lib/video-tools';

export const dynamic='force-dynamic';

const Body=z.object({clips:z.array(z.string().min(1).max(2048)).min(1,'No clips supplied').max(400),finish:FinishSchema.nullish()});

export async function POST(req:Request){
 let input;
 try{input=Body.parse(await req.json())}
 catch(e){return NextResponse.json({status:'failed',message:e instanceof z.ZodError?e.issues.map(i=>(i.path.join('.')||'body')+': '+i.message).join('; '):'Invalid request'},{status:400})}
 try{return NextResponse.json(await submitRender(input.clips,input.finish??undefined))}
 catch(e){return NextResponse.json({status:'failed',message:e instanceof Error?e.message:'Render failed'},{status:502})}
}
