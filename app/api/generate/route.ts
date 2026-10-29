import {NextResponse} from 'next/server';
import {z} from 'zod';
import {submitGeneration} from '@/lib/generation';
import {PROVIDER_IDS} from '@/lib/providers';

export const dynamic='force-dynamic';

const Body=z.object({
 provider:z.enum(PROVIDER_IDS).default('ltx'),
 prompt:z.string().trim().min(3).max(12000),
 duration:z.number().int().min(1).max(30).default(5),
 imageUrl:z.string().url().refine(u=>/^https?:\/\//i.test(u),'imageUrl must be http(s)').optional(),
});

export async function POST(req:Request){
 let input;
 try{input=Body.parse(await req.json())}
 catch(e){return NextResponse.json({status:'failed',error:e instanceof z.ZodError?e.issues.map(i=>i.path.join('.')+': '+i.message).join('; '):'Invalid request'},{status:400})}
 try{
  const result=await submitGeneration({...input,duration:Math.round(input.duration)});
  return NextResponse.json(result,{status:result.status==='failed'&&result.message?.includes('not configured')?503:200});
 }catch(e){return NextResponse.json({status:'failed',error:e instanceof Error?e.message:'Generation failed'},{status:502})}
}
