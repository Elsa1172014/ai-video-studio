import {route, body, param} from '@/lib/server/http';
import {CharacterPatch} from '@/lib/server/schemas';
import {deleteCharacter, getCharacter, updateCharacter} from '@/lib/server/series';

export const dynamic = 'force-dynamic';
type Ctx = {params: Promise<{id: string; characterId: string}>};

export const GET = route(async (_: Request, {params}: Ctx) => {
  const p = await params;
  return getCharacter(param(p.id), param(p.characterId, 'character id'));
});
// Returns 409 with lockedFields when an identity field of a locked character would change.
export const PATCH = route(async (req: Request, {params}: Ctx) => {
  const p = await params;
  const x = await body(req, CharacterPatch);
  const clean = Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v === null ? undefined : v]));
  return updateCharacter(param(p.id), param(p.characterId, 'character id'), clean);
});
export const DELETE = route(async (_: Request, {params}: Ctx) => {
  const p = await params;
  await deleteCharacter(param(p.id), param(p.characterId, 'character id'));
  return {ok: true};
});
