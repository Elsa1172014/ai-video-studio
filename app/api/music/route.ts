import {route,HttpError} from '@/lib/server/http';
import {putBytes,validate} from '@/lib/server/storage';
export const POST=route(async(req:Request)=>{
 if(Number(req.headers.get('content-length')||0)>4*1024*1024+65536)throw new HttpError(413,'ملف الموسيقى يجب ألا يتجاوز 4 ميجابايت.');
 const form=await req.formData(), file=form.get('file');if(!(file instanceof File)||file.size>4*1024*1024)throw new HttpError(400,'اختر ملف موسيقى حتى 4 ميجابايت.');
 const bytes=new Uint8Array(await file.arrayBuffer());const {type}=validate(bytes,['audio']);return putBytes('music',bytes,type);
});
