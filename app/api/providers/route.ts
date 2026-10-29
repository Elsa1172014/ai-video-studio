import {NextResponse} from 'next/server';
import {PROVIDERS,FINISHING_TOOLS} from '@/lib/providers';
import {workerCapabilities} from '@/lib/generation';

export const dynamic='force-dynamic';

export async function GET(){
 const worker=await workerCapabilities();
 return NextResponse.json({
  providers:PROVIDERS.map(p=>({...p,available:worker.providers.includes(p.id)})),
  finishing:FINISHING_TOOLS.map(t=>({...t,available:Boolean(worker.capabilities?.[t.id])})),
  worker,
 },{headers:{'Cache-Control':'no-store'}});
}
