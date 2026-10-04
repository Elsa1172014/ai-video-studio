import {NextResponse} from 'next/server';
import {z, ZodError} from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {super(message);}
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`);

// Safe identifiers: we generate UUIDs, legacy clients may send short slugs.
export const Id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/, 'Invalid id');
export const newId = () => crypto.randomUUID();

export async function body<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > 1_000_000) throw new HttpError(413, 'Request body too large');
  let raw: unknown;
  try {raw = await req.json();} catch {throw new HttpError(400, 'Request body must be JSON');}
  return schema.parse(raw);
}

export function param(value: string, label = 'id') {
  const r = Id.safeParse(value);
  if (!r.success) throw new HttpError(400, `Invalid ${label}`);
  return r.data;
}

// Wraps a route handler: maps validation and domain errors to meaningful HTTP statuses
// and never leaks stack traces or secrets.
export function route<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const out = await fn(...args);
      return out instanceof Response ? out : NextResponse.json(out);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({error: e.message, details: e.details}, {status: e.status});
      if (e instanceof ZodError) {
        return NextResponse.json({error: 'Invalid request', details: e.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`)}, {status: 400});
      }
      console.error('[api]', e);
      return NextResponse.json({error: e instanceof Error ? e.message : 'Internal error'}, {status: 500});
    }
  };
}
