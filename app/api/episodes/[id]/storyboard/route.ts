import {route, param} from '@/lib/server/http';
import {buildEpisodeStoryboard} from '@/lib/server/series';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Plans the episode with the canonical Character Bible and previous-episode memory loaded server-side.
export const POST = route(async (_: Request, {params}: {params: Promise<{id: string}>}) => buildEpisodeStoryboard(param((await params).id)));
