import {route, body, param, HttpError} from '@/lib/server/http';
import {ScenePatch} from '@/lib/server/schemas';
import {editScene} from '@/lib/server/storyboard';

export const dynamic = 'force-dynamic';

export const PATCH = route(async (req: Request, {params}: {params: Promise<{kind: string; id: string; sceneId: string}>}) => {
  const p = await params;
  if (p.kind !== 'episode' && p.kind !== 'project') throw new HttpError(400, 'kind must be episode or project');
  return editScene(p.kind, param(p.id), param(p.sceneId, 'scene id'), await body(req, ScenePatch));
});
