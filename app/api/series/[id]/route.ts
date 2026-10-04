import {route, body, param} from '@/lib/server/http';
import {SeriesIn} from '@/lib/server/schemas';
import {deleteSeries, getSeries, listCharacters, listEpisodes, saveSeries} from '@/lib/server/series';

export const dynamic = 'force-dynamic';
type Ctx = {params: Promise<{id: string}>};

export const GET = route(async (_: Request, {params}: Ctx) => {
  const id = param((await params).id);
  const [series, characters, episodes] = await Promise.all([getSeries(id), listCharacters(id), listEpisodes(id)]);
  return {series, characters, episodes};
});
export const PATCH = route(async (req: Request, {params}: Ctx) => {
  const id = param((await params).id);
  const prev = await getSeries(id);
  const x = await body(req, SeriesIn.partial());
  return saveSeries({...x, title: x.title ?? prev.title}, id);
});
export const DELETE = route(async (_: Request, {params}: Ctx) => {
  await deleteSeries(param((await params).id));
  return {ok: true};
});
