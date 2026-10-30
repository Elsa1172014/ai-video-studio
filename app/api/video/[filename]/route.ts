import {NextRequest,NextResponse} from 'next/server';
import {assetUrl,cloudConfigured,isCloudAsset} from '@/lib/cloud-github';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:NextRequest,{params}:{params:Promise<{filename:string}>}){
 const {filename}=await params;
 if(!/^[A-Za-z0-9._-]+\.(mp4|srt)$/i.test(filename))return NextResponse.json({error:'Invalid video filename'},{status:400});
 const isCaptions=/\.srt$/i.test(filename);
 // Free cloud: scene clips and films are assets of the GitHub "films" release.
 const cloud=cloudConfigured()&&isCloudAsset(filename);
 // HTTP worker serves /outputs itself; Runpod outputs are served from PUBLIC_OUTPUT_BASE_URL (object storage / file server).
 const base=process.env.GPU_API_URL||process.env.PUBLIC_OUTPUT_BASE_URL;
 // Redirect instead of streaming through the function: video bytes then never count against Vercel's
 // function CPU/bandwidth limits (streaming MP4s through a function is what pauses Hobby projects).
 if(cloud)return NextResponse.redirect(assetUrl(filename),{status:302,headers:{'Cache-Control':'no-store'}});
 if(!base&&!cloud)return NextResponse.json({error:'Set GPU_API_URL (HTTP worker) or PUBLIC_OUTPUT_BASE_URL (Runpod outputs) so videos can be served.'},{status:503});

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
  const target=cloud?assetUrl(filename):base!.replace(/\/$/,'')+'/outputs/'+encodeURIComponent(filename);
  if(cloud)delete headers.Authorization;
  const upstream=await fetch(target,{
   headers,
   cache:'no-store',
   redirect:'follow'
  });

  const contentType=upstream.headers.get('content-type')||'';
  if(!upstream.ok&&upstream.status!==206){
   const body=await upstream.text();
   return NextResponse.json({error:'Video upstream failed',status:upstream.status,detail:body.slice(0,300)},{status:502});
  }
  if(isCaptions){
   return new NextResponse(await upstream.text(),{headers:{'Content-Type':'application/x-subrip; charset=utf-8','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'no-store'}});
  }
  if(!cloud&&!contentType.toLowerCase().includes('video/mp4')){
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
