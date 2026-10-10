import {z} from 'zod';
import {route, body, HttpError} from '@/lib/server/http';
import {createJob} from '@/lib/server/jobs';
import {Id} from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Final render of a stored episode/project: all completed clips in order, with scene audio.
const S = z.object({ownerKind: z.enum(['episode', 'project']), ownerId: Id, force: z.boolean().optional()});
export const POST = route(async (req: Request) => {
  const x = await body(req, S).catch(e => {throw e instanceof HttpError ? e : new HttpError(400, 'ownerKind and ownerId are required');});
  return createJob(x.ownerKind, x.ownerId, {type: 'render', force: x.force});
});
