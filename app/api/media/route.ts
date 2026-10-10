import {z} from 'zod';
import {route, HttpError} from '@/lib/server/http';
import {ingestRemote, putBytes, validate, LIMITS, storageDurable} from '@/lib/server/storage';
import {assertSafeUrl} from '@/lib/server/net';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Uploads a character reference image (multipart "file") or imports one from a public https URL
// (JSON {url}) into durable storage. Bytes are validated by magic number, never by extension.
export const POST = route(async (req: Request) => {
  const type = req.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const {url} = z.object({url: z.string().url().max(2000)}).parse(await req.json());
    await assertSafeUrl(url);
    const ref = await ingestRemote(url, 'references', ['image'], {trustedOnly: false});
    return {...ref, warning: storageDurable() ? undefined : 'No durable storage configured; the original URL is kept.'};
  }
  if (Number(req.headers.get('content-length') || 0) > LIMITS.image + 64 * 1024) throw new HttpError(413, 'Image must be 4 MB or smaller');
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'Image file is required');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const {type: mime} = validate(bytes, ['image']);
  const ref = await putBytes('references', bytes, mime);
  return {...ref, warning: ref.durable ? undefined : 'Saved to local disk (development only). Configure BLOB_READ_WRITE_TOKEN or S3_* for durable storage.'};
});