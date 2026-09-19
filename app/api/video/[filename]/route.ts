import {NextRequest,NextResponse} from 'next/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:NextRequest,{params}:{params:Promise<{filename:string}>}){
 const {filename}=await params;
 if(!/^[A-Za-z0-9._-]+\.mp4$/i.test(filename))return NextResponse.json({error:'Invalid video filename'},{status:400});
 const base=process.env.GPU_API_URL;
 if(!base)return NextResponse.json({error:'GPU endpoint is not configured'},{status:503});

 const headers:Record<string,string>={
  'ngrok-skip-browser-warning':'true',
  'User-Agent':'AI-Video-Studio/1.0',
  'Accept':'video/mp4,video/*;q=0.9,*/*;q=0.8'
 };
 const range=req.headers.get('range');
 if(range)headers.Range=range;
 const key=process.env.GPU_API_KEY;
 if(key)headers.Authorization=`Bearer ${key}`;

 try{
  const upstream=await fetch(base.replace(/\/$/,'')+'/outputs/'+encodeURIComponent(filename),{
   headers,
   cache:'no-store',
   redirect:'follow'
  });

  const contentType=upstream.headers.get('content-type')||'';
  if(!upstream.ok&&upstream.status!==206){
   const body=await upstream.text();
   return NextResponse.json({error:'Video upstream failed',status:upstream.status,detail:body.slice(0,300)},{status:502});
  }
  if(!contentType.toLowerCase().includes('video/mp4')){
   const body=await upstream.text();
   return NextResponse.json({error:'Upstream did not return MP4',contentType,detail:body.slice(0,300)},{status:502});
  }

  const outHeaders=new Headers();
  for(const name of ['content-type','content-length','content-range','accept-ranges','etag','last-modified']){
   const value=upstream.headers.get(name);
   if(value)outHeaders.set(name,value);
  }
  outHeaders.set('Content-Type','video/mp4');
  outHeaders.set('Accept-Ranges','bytes');
  outHeaders.set('Cache-Control','no-store, no-cache, must-revalidate');
  return new NextResponse(upstream.body,{status:upstream.status,headers:outHeaders});
 }catch(error){
  return NextResponse.json({error:'Video proxy request failed',detail:error instanceof Error?error.message:'Unknown error'},{status:502});
 }
}
