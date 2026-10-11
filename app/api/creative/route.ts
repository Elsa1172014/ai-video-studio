import {z} from 'zod';
import {route,body,HttpError} from '@/lib/server/http';
import {Direction} from '@/lib/server/schemas';
import {improveDirection} from '@/lib/server/director';
export const maxDuration=180;
export const POST=route(async(req:Request)=>{const x=await body(req,z.object({direction:Direction,seconds:z.number().int().min(5).max(1800)}));try {return await improveDirection(x.direction,x.seconds);} catch(e) {if(e instanceof HttpError)throw e; const status=(e as {status?:number}).status; throw new HttpError(503, status===401?'تعذّر اتصال المخرج الذكي: مفتاح الخدمة غير صالح. يمكنك تحرير المقترح يدويًا.':status===429?'المخرج الذكي تجاوز حد الاستخدام. جرّب لاحقًا أو حرّر المقترح يدويًا.':'تعذّر تشغيل المخرج الذكي حاليًا. المقترحات اليدوية متاحة، ولم يُحذف شيء من النص.');}});
