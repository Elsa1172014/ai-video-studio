import {NextResponse} from 'next/server';
export async function GET(){
 const endpoint=process.env.RUNPOD_ENDPOINT_ID,key=process.env.RUNPOD_API_KEY;
 if(endpoint&&key){try{const r=await fetch(`https://api.runpod.ai/v2/${endpoint}/health`,{headers:{Authorization:`Bearer ${key}`},cache:'no-store',signal:AbortSignal.timeout(10000)});return NextResponse.json({web:true,gpu:r.ok,status:r.ok?'runpod-ready':'runpod-error',provider:'runpod',httpStatus:r.status})}catch(e){return NextResponse.json({web:true,gpu:false,status:'runpod-unreachable',provider:'runpod',error:e instanceof Error?e.message:'Unknown error'})}}
 const base=process.env.GPU_API_URL;const legacyKey=process.env.GPU_API_KEY;if(!base)return NextResponse.json({web:true,gpu:false,status:'gpu-unconfigured'});
 try{const r=await fetch(base.replace(/\/$/,'')+'/health',{headers:legacyKey?{Authorization:`Bearer ${legacyKey}`}:{},cache:'no-store',signal:AbortSignal.timeout(10000)});return NextResponse.json({web:true,gpu:r.ok,status:r.ok?'gpu-ready':'gpu-error',provider:'legacy',httpStatus:r.status})}catch(e){return NextResponse.json({web:true,gpu:false,status:'gpu-unreachable',error:e instanceof Error?e.message:'Unknown error'})}
}