import {route, body, param} from '@/lib/server/http';
import {ProjectPatch} from '@/lib/server/schemas';
import {deleteProject, getProject, updateProject} from '@/lib/server/projects';

export const dynamic = 'force-dynamic';
type Ctx = {params: Promise<{id: string}>};

export const GET = route(async (_: Request, {params}: Ctx) => getProject(param((await params).id)));
export const PATCH = route(async (req: Request, {params}: Ctx) => updateProject(param((await params).id), await body(req, ProjectPatch)));
export const DELETE = route(async (_: Request, {params}: Ctx) => {
  await deleteProject(param((await params).id));
  return {ok: true};
});
