import {route, body, param} from '@/lib/server/http';
import {CharacterIn} from '@/lib/server/schemas';
import {createCharacter, listCharacters, getSeries} from '@/lib/server/series';

export const dynamic = 'force-dynamic';
type Ctx = {params: Promise<{id: string}>};

export const GET = route(async (_: Request, {params}: Ctx) => {
  const id = param((await params).id);
  await getSeries(id);
  return {characters: await listCharacters(id)};
});
export const POST = route(async (req: Request, {params}: Ctx) => createCharacter(param((await params).id), await body(req, CharacterIn)));
