import {route, body} from '@/lib/server/http';
import {ProjectIn} from '@/lib/server/schemas';
import {createProject, listProjects} from '@/lib/server/projects';
import {durable} from '@/lib/server/db';

export const dynamic = 'force-dynamic';
export const GET = route(async () => ({durable: durable(), projects: await listProjects()}));
export const POST = route(async (req: Request) => createProject(await body(req, ProjectIn)));
