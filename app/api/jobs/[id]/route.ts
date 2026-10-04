import {route, param} from '@/lib/server/http';
import {getJob, refreshJob} from '@/lib/server/jobs';
import * as gpu from '@/lib/server/gpu';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Refreshes a persisted job from its provider. Ids that are not stored jobs are treated as raw
// provider job ids (single-clip preview from /api/generate).
export const GET = route(async (_: Request, {params}: {params: Promise<{id: string}>}) => {
  const id = param((await params).id);
  if (await getJob(id).catch(() => null)) return refreshJob(id);
  try {
    const r = await gpu.status(id);
    return {jobId: id, status: r.status, outputUrl: r.outputUrl, message: r.message};
  } catch (e) {
    return Response.json({jobId: id, status: 'failed', error: e instanceof Error ? e.message : 'Status check failed'}, {status: 502});
  }
});
