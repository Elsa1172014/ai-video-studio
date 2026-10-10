import {z} from 'zod';
import {route, body} from '@/lib/server/http';
import * as gpu from '@/lib/server/gpu';
import {defaultVoice, ttsProvider} from '@/lib/server/config';

export const dynamic = 'force-dynamic';

// One-off TTS preview through the worker's TTS engine (RunPod or HTTP worker).
const S = z.object({text: z.string().trim().min(1).max(4000), language: z.enum(['ar', 'en']).default('ar'), voice: z.string().trim().max(120).optional()});
export const POST = route(async (req: Request) => {
  const x = await body(req, S);
  try {
    const r = await gpu.submit('voice', {language: x.language, segments: [{text: x.text, voice: x.voice || defaultVoice(), provider: ttsProvider(), speaker: 'Narrator'}]});
    return {jobId: r.providerJobId, status: r.status, outputUrl: r.outputUrl, message: r.message};
  } catch (e) {
    if (e instanceof gpu.GpuNotConfigured) return Response.json({status: 'unconfigured', error: e.message}, {status: 503});
    throw e;
  }
});
