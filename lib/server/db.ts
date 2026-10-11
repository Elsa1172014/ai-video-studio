// Server-side document store.
// - DATABASE_URL set  -> PostgreSQL (Neon, Vercel Postgres, Supabase, RDS...) via `postgres`.
// - otherwise         -> JSON file under DATA_DIR (default .data/). Dev only: Vercel's disk is ephemeral.
import {promises as fs} from 'fs';
import path from 'path';
import postgres from 'postgres';

export type Kind = 'series' | 'character' | 'episode' | 'project' | 'job';
type Row<T> = {kind: Kind; id: string; parentId: string; data: T; createdAt: string; updatedAt: string};

export const durable = () => Boolean(process.env.DATABASE_URL);

// ---------- PostgreSQL ----------
let client: postgres.Sql | null = null;
let migrated: Promise<void> | null = null;

export const MIGRATION = `
CREATE TABLE IF NOT EXISTS studio_docs(
  kind text NOT NULL,
  id text NOT NULL,
  parent_id text NOT NULL DEFAULT '',
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(kind,id)
);
CREATE INDEX IF NOT EXISTS studio_docs_parent ON studio_docs(kind,parent_id,updated_at);
`;

async function pg() {
  // max:1 + prepare:false keeps serverless functions friendly to poolers (PgBouncer / Neon pooler).
  client ??= postgres(process.env.DATABASE_URL!, {max: 1, prepare: false, idle_timeout: 20, connect_timeout: 15, onnotice: () => {}});
  migrated ??= client.unsafe(MIGRATION).then(() => undefined).catch(e => {migrated = null; throw e;});
  await migrated;
  return client;
}

const fromPg = (r: any): Row<any> => ({
  kind: r.kind, id: r.id, parentId: r.parent_id,
  data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data,
  createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString(),
});

// ---------- JSON file fallback ----------
const file = () => path.join(process.env.DATA_DIR || path.join(process.cwd(), '.data'), 'studio.json');
let chain: Promise<unknown> = Promise.resolve();

// Serialise every file access so concurrent requests in one process never clobber each other.
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}
// Re-read on every access: dev servers may run several worker processes over the same file.
async function readAll(): Promise<Row<any>[]> {
  try {return JSON.parse(await fs.readFile(file(), 'utf8'));} catch {return [];}
}
async function writeAll(rows: Row<any>[]) {
  const f = file();
  await fs.mkdir(path.dirname(f), {recursive: true});
  const tmp = f + '.' + process.pid + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(rows));
  await fs.rename(tmp, f);
}

// ---------- API ----------
export async function put<T>(kind: Kind, id: string, parentId: string, data: T): Promise<T> {
  const now = new Date().toISOString();
  if (durable()) {
    const sql = await pg();
    await sql`INSERT INTO studio_docs(kind,id,parent_id,data,updated_at)
      VALUES(${kind},${id},${parentId},${sql.json(data as any)},${now})
      ON CONFLICT(kind,id) DO UPDATE SET parent_id=EXCLUDED.parent_id,data=EXCLUDED.data,updated_at=EXCLUDED.updated_at`;
    return data;
  }
  return locked(async () => {
    const all = await readAll();
    const i = all.findIndex(r => r.kind === kind && r.id === id);
    const row: Row<T> = {kind, id, parentId, data, createdAt: i >= 0 ? all[i].createdAt : now, updatedAt: now};
    const next = [...all];
    if (i >= 0) next[i] = row; else next.push(row);
    await writeAll(next);
    return data;
  });
}

export async function get<T>(kind: Kind, id: string): Promise<T | null> {
  if (durable()) {
    const sql = await pg();
    const r = await sql`SELECT * FROM studio_docs WHERE kind=${kind} AND id=${id}`;
    return r[0] ? (fromPg(r[0]).data as T) : null;
  }
  return locked(async () => ((await readAll()).find(r => r.kind === kind && r.id === id)?.data as T) ?? null);
}

export async function list<T>(kind: Kind, parentId?: string): Promise<T[]> {
  if (durable()) {
    const sql = await pg();
    const r = parentId === undefined
      ? await sql`SELECT * FROM studio_docs WHERE kind=${kind} ORDER BY updated_at DESC LIMIT 500`
      : await sql`SELECT * FROM studio_docs WHERE kind=${kind} AND parent_id=${parentId} ORDER BY updated_at DESC LIMIT 2000`;
    return r.map(x => fromPg(x).data as T);
  }
  return locked(async () => (await readAll())
    .filter(r => r.kind === kind && (parentId === undefined || r.parentId === parentId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(r => r.data as T));
}

export async function remove(kind: Kind, id: string) {
  if (durable()) {const sql = await pg(); await sql`DELETE FROM studio_docs WHERE kind=${kind} AND id=${id}`; return;}
  await locked(async () => writeAll((await readAll()).filter(r => !(r.kind === kind && r.id === id))));
}

export async function removeChildren(kind: Kind, parentId: string) {
  if (durable()) {const sql = await pg(); await sql`DELETE FROM studio_docs WHERE kind=${kind} AND parent_id=${parentId}`; return;}
  await locked(async () => writeAll((await readAll()).filter(r => !(r.kind === kind && r.parentId === parentId))));
}

export async function ping(): Promise<{ok: boolean; driver: 'postgres' | 'file'; error?: string}> {
  try {
    if (durable()) {const sql = await pg(); await sql`SELECT 1`; return {ok: true, driver: 'postgres'};}
    await locked(readAll);
    return {ok: true, driver: 'file'};
  } catch (e) {
    return {ok: false, driver: durable() ? 'postgres' : 'file', error: e instanceof Error ? e.message : String(e)};
  }
}

// Test hook: close the pool.
export async function resetForTests() {
  if (client) {await client.end({timeout: 1}); client = null; migrated = null;}
}
