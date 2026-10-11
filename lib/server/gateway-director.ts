import * as z from 'zod/v4';
import {HttpError} from './http';
import {getVercelOidcTokenSync} from '@vercel/oidc';

export const gatewayToken = () => {
  if(process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  try{return getVercelOidcTokenSync();}catch{return undefined;}
};

/** Use the deployment's short-lived identity; never expose credentials or provider errors. */
export async function gatewayDirector<T>(schema:z.ZodType<T>, system:string, user:string):Promise<T> {
  const token=gatewayToken();
  if(!token) throw new HttpError(503,'لم يُفعّل اتصال المخرج الذكي بعد.');
  const response=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{
    method:'POST',cache:'no-store',signal:AbortSignal.timeout(90_000),
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({model:process.env.AI_GATEWAY_MODEL || 'moonshotai/kimi-k3',max_tokens:8000,reasoning_effort:'none',
      messages:[{role:'system',content:system+'\nReturn only valid JSON matching this schema, without markdown: '+JSON.stringify(z.toJSONSchema(schema))},{role:'user',content:user}]}),
  });
  if(!response.ok){
    const status=response.status;
    throw new HttpError(503,status===402?'رصيد المخرج الذكي أو حد استخدامه غير متاح في Vercel AI Gateway.':status===403?'يحتاج Vercel AI Gateway إلى تفعيل الحساب أو السماح بالنموذج قبل تشغيل المخرج الذكي.':status===401?'تعذّر توثيق اتصال المخرج الذكي مع Vercel.':status===429?'بلغ المخرج الذكي حد الطلبات؛ انتظر قليلًا ثم أعد المحاولة.':'خدمة المخرج الذكي غير متاحة مؤقتًا.');
  }
  const result=await response.json();
  const choice=result.choices?.[0];
  if(choice?.finish_reason!=='stop' || typeof choice.message?.content!=='string') throw new HttpError(502,'لم يكتمل المقترح الذكي؛ لم تتغير أفكارك المحفوظة.');
  try{return schema.parse(JSON.parse(choice.message.content.replace(/^```(?:json)?\s*|\s*```$/g,'')));}
  catch{throw new HttpError(502,'تعذّر التحقق من صيغة المقترح الذكي؛ أعد المحاولة.');}
}
