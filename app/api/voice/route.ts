import {NextResponse} from 'next/server';
import {z} from 'zod';
import {submitVoice} from '@/lib/generation';

export const dynamic='force-dynamic';

const Body=z.object({text:z.string().trim().min(1).max(5000),language:z.string().min(2).max(10).default('ar'),voice:z.string().min(1).max(80).default('default')});

export async function POST(req:Request){
 let input;
 try{input=Body.parse(await req.json())}
 catch{return NextResponse.json({status:'failed',error:'Text is required (max 5000 characters).'},{status:400})}
 try{return NextResponse.json(await submitVoice(input))}
 catch(e){return NextResponse.json({status:'failed',error:e instanceof Error?e.message:'Voice generation failed'},{status:502})}
}
