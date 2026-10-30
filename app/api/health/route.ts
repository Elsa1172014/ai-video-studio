import {NextResponse} from 'next/server';
import {backend} from '@/lib/generation';

export const dynamic='force-dynamic';

export async function GET(){
 const mode=backend();
 if(mode==='cloud')return NextResponse.json({web:true,gpu:true,status:'cloud-ready',provider:'cloud',label:'Free cloud'});
 const endpoint=process.env.RUNPOD_ENDPOINT_ID,key=process.env.RUNPOD_API_KEY;
 if(endpoint&&key){try{const r=await fetch(`https://api.runpod.ai/v2/${endpoint}/health`,{headers:{Authorization:`Bearer ${key}`},cache:'no-store',signal:AbortSignal.timeout(10000)});return NextResponse.json({web:true,gpu:r.ok,status:r.ok?'runpod-ready':'runpod-error',provider:'runpod',httpStatus:r.status})}catch(e){return NextResponse.json({web:true,gpu:false,status:'runpod-unreachable',provider:'runpod',error:e instanceof Error?e.message:'Unknown error'})}}
 const base=process.env.GPU_API_URL;const legacyKey=process.env.GPU_API_KEY;
 if(!base){
  // Say exactly which free-cloud setting is missing (never the values themselves).
  const repo=process.env.GITHUB_CLOUD_REPO||'';
  const cloud={GITHUB_CLOUD_REPO:!repo?'missing':/^[\w.-]+\/[\w.-]+$/.test(repo.trim().replace(/^https:\/\/github\.com\//,'').replace(/\/$/,''))?'ok':'invalid (use owner/repo, e.g. Elsa1172014/ai-video-studio)',GITHUB_CLOUD_TOKEN:process.env.GITHUB_CLOUD_TOKEN?'set':'missing',deployment:process.env.VERCEL_ENV||'local'};
  return NextResponse.json({web:true,gpu:false,status:'gpu-unconfigured',cloud});
 }
 try{const r=await fetch(base.replace(/\/$/,'')+'/health',{headers:legacyKey?{Authorization:`Bearer ${legacyKey}`}:{},cache:'no-store',signal:AbortSignal.timeout(10000)});return NextResponse.json({web:true,gpu:r.ok,status:r.ok?'gpu-ready':'gpu-error',provider:'legacy',httpStatus:r.status})}catch(e){return NextResponse.json({web:true,gpu:false,status:'gpu-unreachable',error:e instanceof Error?e.message:'Unknown error'})}
}
