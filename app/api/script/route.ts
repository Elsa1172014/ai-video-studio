import {z} from 'zod';
import {route, body} from '@/lib/server/http';
import {plan} from '@/lib/server/director';
import {attachShots} from '@/lib/prompts';
import {maxShotSeconds} from '@/lib/server/config';
import {detectLanguage} from '@/lib/planner';
import {seriesContext} from '@/lib/server/series';
import {Id} from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Stateless storyboard preview. With seriesId the canonical Character Bible and previous-episode
// memory are loaded server-side. Stored productions use /api/projects/:id/storyboard and
// /api/episodes/:id/storyboard instead.
const S = z.object({
  prompt: z.string().trim().min(3).max(40000), minutes: z.number().min(0.5).max(30),
  mode: z.enum(['education', 'series']).default('education'), seriesId: Id.optional(), episodeNumber: z.number().int().min(1).optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
});
export const POST = route(async (req: Request) => {
  const x = await body(req, S);
  const ctx = x.mode === 'series' && x.seriesId ? await seriesContext(x.seriesId, x.episodeNumber) : null;
  const language = ctx?.series.language || detectLanguage(x.prompt);
  const characters = ctx?.characters || [];
  const board = await plan({mode: x.mode, text: x.prompt, minutes: x.minutes, language, characters, continuity: ctx?.continuity});
  return attachShots(board, {mode: x.mode, aspectRatio: x.aspectRatio, characters, continuity: ctx?.continuity, style: ctx?.series.style, maxShotSeconds: maxShotSeconds()});
});
