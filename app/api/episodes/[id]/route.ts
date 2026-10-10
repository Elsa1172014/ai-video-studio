import {route, body, param} from '@/lib/server/http';
import {EpisodePatch} from '@/lib/server/schemas';
import {deleteEpisode, getEpisode, updateEpisode} from '@/lib/server/series';

export const dynamic = 'force-dynamic';
type Ctx = {params: Promise<{id: string}>};

export const GET = route(async (_: Request, {params}: Ctx) => getEpisode(param((await params).id)));
export const PATCH = route(async (req: Request, {params}: Ctx) => updateEpisode(param((await params).id), await body(req, EpisodePatch)));
export const DELETE = route(async (_: Request, {params}: Ctx) => {
  await deleteEpisode(param((await params).id));
  return {ok: true};
});
