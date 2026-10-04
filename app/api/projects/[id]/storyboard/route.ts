import {route, param} from '@/lib/server/http';
import {buildProjectStoryboard} from '@/lib/server/projects';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const POST = route(async (_: Request, {params}: {params: Promise<{id: string}>}) => buildProjectStoryboard(param((await params).id)));
