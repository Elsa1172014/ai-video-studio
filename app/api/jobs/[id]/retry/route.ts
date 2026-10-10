import {route, param} from '@/lib/server/http';
import {retryJob} from '@/lib/server/jobs';

export const dynamic = 'force-dynamic';
export const POST = route(async (_: Request, {params}: {params: Promise<{id: string}>}) => retryJob(param((await params).id)));
