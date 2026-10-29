import {NextResponse} from 'next/server';
import {uploadMedia} from '@/lib/generation';

export const dynamic='force-dynamic';
const MAX=50*1024*1024;
const TYPES=/^(image|audio|video)\//;

export async function POST(req:Request){
 try{
  const form=await req.formData();const file=form.get('file');
  if(!(file instanceof File))return NextResponse.json({error:'Attach a file in the "file" field.'},{status:400});
  if(!TYPES.test(file.type))return NextResponse.json({error:'Only image, audio or video files are accepted.'},{status:415});
  if(file.size>MAX)return NextResponse.json({error:'File is larger than 50 MB. Host it and paste a public URL instead.'},{status:413});
  return NextResponse.json(await uploadMedia(file));
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Upload failed'},{status:502})}
}
