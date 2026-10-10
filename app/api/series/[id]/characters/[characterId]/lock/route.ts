import {z} from 'zod';
import {route, body, param} from '@/lib/server/http';
import {setLock} from '@/lib/server/series';

export const dynamic = 'force-dynamic';
type Ctx = {params: Promise<{id: string; characterId: string}>};

// Explicit lock / unlock: the only way to make identity fields editable again.
export const POST = route(async (req: Request, {params}: Ctx) => {
  const p = await params;
  const {locked} = await body(req, z.object({locked: z.boolean()}));
  return setLock(param(p.id), param(p.characterId, 'character id'), locked);
});
