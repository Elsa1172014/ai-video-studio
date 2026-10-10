import {route, HttpError} from '@/lib/server/http';
import {openLocal, driver} from '@/lib/server/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Serves locally stored media (dev fallback only). Supports Range requests for video seeking.
export const GET = route(async (req: Request, {params}: {params: Promise<{key: string[]}>}) => {
  if (driver() !== 'local') throw new HttpError(404, 'Not found');
  const f = await openLocal((await params).key.join('/'));
  const range = req.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
  const headers: Record<string, string> = {'Content-Type': f.type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff'};
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, f.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), f.size - 1) : f.size - 1;
    if (start > end || start >= f.size) return new Response(null, {status: 416, headers: {'Content-Range': `bytes */${f.size}`}});
    return new Response(f.stream(start, end), {status: 206, headers: {...headers, 'Content-Range': `bytes ${start}-${end}/${f.size}`, 'Content-Length': String(end - start + 1)}});
  }
  return new Response(f.stream(), {headers: {...headers, 'Content-Length': String(f.size)}});
});
