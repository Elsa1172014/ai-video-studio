import {NextResponse} from 'next/server';
export async function GET(){
 const base=process.env.GPU_API_URL;const key=process.env.GPU_API_KEY;
 if(!base)return NextResponse.json({web:true,gpu:false,status:'web-ready-gpu-unconfigured'});
 try{
  const r=await fetch(base.replace(/\/$/,'')+'/health',{headers:key?{Authorization:`Bearer ${key}`}:{},cache:'no-store',signal:AbortSignal.timeout(10000)});
  const text=await r.text();let worker:unknown=null;try{worker=JSON.parse(text)}catch{worker={raw:text.slice(0,300)}}
  return NextResponse.json({web:true,gpu:r.ok,status:r.ok?'gpu-ready':'gpu-error',worker,httpStatus:r.status});
 }catch(e){return NextResponse.json({web:true,gpu:false,status:'gpu-unreachable',error:e instanceof Error?e.message:'Unknown error'})}
}