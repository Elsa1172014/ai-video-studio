import {NextResponse} from 'next/server';
import {getGeneration} from '@/lib/generation';

export const dynamic='force-dynamic';

export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!/^[A-Za-z0-9_-]{6,128}$/.test(id))return NextResponse.json({status:'failed',error:'Invalid job id'},{status:400});
 try{return NextResponse.json(await getGeneration(id),{headers:{'Cache-Control':'no-store'}})}
 catch(e){return NextResponse.json({jobId:id,status:'failed',error:e instanceof Error?e.message:'تعذّر التحقق من الحالة'},{status:502})}
}
