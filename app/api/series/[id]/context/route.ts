import {route, param} from '@/lib/server/http';
import {seriesContext} from '@/lib/server/series';

export const dynamic = 'force-dynamic';

// Canonical characters + bounded memory of episodes before ?episode=N.
export const GET = route(async (req: Request, {params}: {params: Promise<{id: string}>}) => {
  const ep = new URL(req.url).searchParams.get('episode');
  const n = ep ? Number(ep) : undefined;
  return seriesContext(param((await params).id), n && Number.isInteger(n) ? n : undefined);
});
