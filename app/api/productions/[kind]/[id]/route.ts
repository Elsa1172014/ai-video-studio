import {route, param, HttpError} from '@/lib/server/http';
import {production} from '@/lib/server/jobs';

export const dynamic = 'force-dynamic';

function ownerKind(k: string) {
  if (k !== 'episode' && k !== 'project') throw new HttpError(400, 'kind must be episode or project');
  return k;
}

// Jobs + derived status for an episode or educational project (used to resume after refresh).
export const GET = route(async (_: Request, {params}: {params: Promise<{kind: string; id: string}>}) => {
  const p = await params;
  return production(ownerKind(p.kind), param(p.id));
});
