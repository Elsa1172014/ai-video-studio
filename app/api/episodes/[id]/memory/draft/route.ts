import {route, param} from '@/lib/server/http';
import {draftMemory} from '@/lib/server/series';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Proposes structured continuity memory for review; nothing is saved until PUT /memory.
export const POST = route(async (_: Request, {params}: {params: Promise<{id: string}>}) => draftMemory(param((await params).id)));
