import {route, body, param} from '@/lib/server/http';
import {Memory} from '@/lib/server/schemas';
import {saveMemory} from '@/lib/server/series';

export const dynamic = 'force-dynamic';

export const PUT = route(async (req: Request, {params}: {params: Promise<{id: string}>}) => saveMemory(param((await params).id), await body(req, Memory)));
