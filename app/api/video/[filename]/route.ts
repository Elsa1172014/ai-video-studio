import {NextRequest,NextResponse} from 'next/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:NextRequest,{params}:{params:Promise<{filename:string}>}){
 const {filename}=await params;
 if(!/^[A-Za-z0-9._-]+\.mp4$/i.test(filename))return NextResponse.json({error:'Invalid video filename'},{status:400});
 const base=process.env.GPU_API_URL;
 if(!base)return NextResponse.json({error:'GPU endpoint is not configured'},{status:503});
 const headers:Record<string,string>={'ngrok-skip-browser-warning':'true'};
 const range=req.headers.get('range');
 if(range)headers.Range=range;
 const upstream=await fetch(base.replace(/\/$/,'')+'/outputs/'+encodeURIComponent(filename),{headers,cache:'no-store'});
 if(!upstream.ok&&upstream.status!==206)return new NextResponse(await upstream.text(),{status:upstream.status});
 const outHeaders=new Headers();
 for(const name of ['content-type','content-length','content-range','accept-ranges','etag','last-modified']){
  const value=upstream.headers.get(name);if(value)outHeaders.set(name,value);
 }
 outHeaders.set('Cache-Control','no-store');
 return new NextResponse(upstream.body,{status:upstream.status,headers:outHeaders});
}
