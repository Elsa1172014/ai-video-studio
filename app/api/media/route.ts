import {NextResponse} from 'next/server';
import {uploadMedia} from '@/lib/generation';

export const dynamic='force-dynamic';
const MAX=50*1024*1024;
const TYPES=/^(image|audio|video)\//;

export async function POST(req:Request){
 try{
  const form=await req.formData();const file=form.get('file');
  if(!(file instanceof File))return NextResponse.json({error:'أرفق ملفاً.'},{status:400});
  if(!TYPES.test(file.type))return NextResponse.json({error:'يُقبل فقط ملف صورة أو صوت أو فيديو.'},{status:415});
  if(file.size>MAX)return NextResponse.json({error:'الملف أكبر من ٥٠ ميغابايت. ارفعه إلى خدمة تخزين والصق رابطه العام.'},{status:413});
  return NextResponse.json(await uploadMedia(file));
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'تعذّر الرفع'},{status:502})}
}
