import {NextResponse} from 'next/server';
import * as gpu from '@/lib/server/gpu';
import {ping} from '@/lib/server/db';
import {driver, storageDurable} from '@/lib/server/storage';
import {directorEnabled} from '@/lib/server/director';

export const dynamic = 'force-dynamic';

// Configuration status only: never returns secrets.
export async function GET() {
  const [g, database] = await Promise.all([gpu.health(), ping()]);
  return NextResponse.json({
    web: true,
    gpu: g.ok,
    gpuProvider: g.provider,
    gpuMessage: g.ok ? undefined : g.message,
    database: {...database, durable: database.driver === 'postgres'},
    storage: {driver: driver(), durable: storageDurable()},
    director: directorEnabled() ? 'llm' : 'deterministic',
    auth: Boolean(process.env.STUDIO_PASSWORD),
  });
}