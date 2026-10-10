import {route, body} from '@/lib/server/http';
import {SeriesIn} from '@/lib/server/schemas';
import {listSeries, saveSeries} from '@/lib/server/series';
import {durable} from '@/lib/server/db';

export const dynamic = 'force-dynamic';
export const GET = route(async () => ({durable: durable(), series: await listSeries()}));
export const POST = route(async (req: Request) => saveSeries(await body(req, SeriesIn)));
