import {NextResponse} from 'next/server';
export async function POST(req:Request){
 try{
  const base=process.env.GPU_API_URL;if(!base)return NextResponse.json({status:'unconfigured',message:'Connect GPU_API_URL to render MP4'},{status:503});
  const body=await req.json();
  const clips=Array.isArray(body.clips)?body.clips.map((x:string)=>{try{const u=new URL(x);return decodeURIComponent(u.pathname.split('/').pop()||'')}catch{return x.split('/').pop()||x}}):[];
  const r=await fetch(base.replace(/\/$/,'')+'/render',{method:'POST',headers:{'Content-Type':'application/json',...(process.env.GPU_API_KEY?{Authorization:`Bearer ${process.env.GPU_API_KEY}`}:{})},body:JSON.stringify({...body,clips}),cache:'no-store'});
  const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={status:'failed',message:text||('Render returned '+r.status)}}
  return NextResponse.json(data,{status:r.ok?200:502});
 }catch(e){return NextResponse.json({status:'failed',message:e instanceof Error?e.message:'Render failed'},{status:500})}
}
