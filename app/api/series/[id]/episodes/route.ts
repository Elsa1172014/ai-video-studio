import {route, body, param} from '@/lib/server/http';
import {EpisodeIn} from '@/lib/server/schemas';
import {createEpisode, getSeries, listEpisodes} from '@/lib/server/series';

export const dynamic = 'force-dynamic';
type Ctx = {params: Promise<{id: string}>};

export const GET = route(async (_: Request, {params}: Ctx) => {
  const id = param((await params).id);
  await getSeries(id);
  return {episodes: await listEpisodes(id)};
});
export const POST = route(async (req: Request, {params}: Ctx) => createEpisode(param((await params).id), await body(req, EpisodeIn)));
