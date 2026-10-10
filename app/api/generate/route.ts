import {z} from 'zod';
import {route, body} from '@/lib/server/http';
import * as gpu from '@/lib/server/gpu';
import {maxShotSeconds, videoProvider} from '@/lib/server/config';

export const dynamic = 'force-dynamic';

// Single-clip preview (not persisted). Production clips go through POST /api/jobs.
const S = z.object({
  provider: z.enum(['ltx', 'wan']).optional(), prompt: z.string().trim().min(3).max(4000),
  duration: z.number().int().min(1).max(30), imageUrl: z.string().url().max(2000).optional(),
});
export const POST = route(async (req: Request) => {
  const x = await body(req, S);
  try {
    const r = await gpu.submit('generate', {...x, provider: x.provider || videoProvider(), duration: Math.min(x.duration, maxShotSeconds())});
    return {jobId: r.providerJobId, status: r.status, outputUrl: r.outputUrl, message: r.message, provider: x.provider || videoProvider()};
  } catch (e) {
    if (e instanceof gpu.GpuNotConfigured) return Response.json({status: 'failed', error: e.message}, {status: 503});
    throw e;
  }
});