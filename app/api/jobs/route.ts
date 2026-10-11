import {route, body, param, HttpError} from '@/lib/server/http';
import {JobIn} from '@/lib/server/schemas';
import {createJob, listJobs} from '@/lib/server/jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const GET = route(async (req: Request) => {
  const owner = new URL(req.url).searchParams.get('ownerId');
  if (!owner) throw new HttpError(400, 'ownerId is required');
  return {jobs: await listJobs(param(owner, 'ownerId'))};
});
// Creates and submits a video (one shot), audio (one scene) or render job. Idempotent per input.
export const POST = route(async (req: Request) => {
  const x = await body(req, JobIn);
  return createJob(x.ownerKind, x.ownerId, x);
});
