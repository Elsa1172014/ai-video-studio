import {z} from 'zod';
import {route, body} from '@/lib/server/http';
import {planScenes} from '@/lib/planner';

export const dynamic = 'force-dynamic';

// Lightweight deterministic scene plan (kept for API compatibility).
const S = z.object({prompt: z.string().trim().min(3).max(40000), minutes: z.number().min(0.5).max(30).default(5), mode: z.enum(['education', 'series']).default('education')});
export const POST = route(async (req: Request) => {
  const x = await body(req, S);
  return {title: x.prompt.slice(0, 80), minutes: x.minutes, ...planScenes({mode: x.mode, text: x.prompt, minutes: x.minutes})};
});
