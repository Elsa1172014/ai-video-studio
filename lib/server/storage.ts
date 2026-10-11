// Durable media storage abstraction.
//   BLOB_READ_WRITE_TOKEN          -> Vercel Blob (recommended on Vercel)
//   S3_BUCKET + S3_ACCESS_KEY_ID…  -> any S3-compatible store (AWS S3, Cloudflare R2, B2, MinIO)
//   neither                        -> local disk under DATA_DIR/media, served by /api/files (dev only)
import {promises as fs, createReadStream} from 'fs';
import path from 'path';
import {Readable} from 'stream';
import {AwsClient} from 'aws4fetch';
import {put as blobPut} from '@vercel/blob';
import type {MediaRef} from '@/lib/types';
import {HttpError} from './http';
import {assertSafeUrl, isBlobHost} from './net';

export type MediaKind = 'image' | 'video' | 'audio';
export const LIMITS: Record<MediaKind, number> = {
  image: 4 * 1024 * 1024, // Vercel function request bodies are capped at 4.5 MB; the UI downsizes first
  video: 1024 * 1024 * 1024,
  audio: 200 * 1024 * 1024,
};

type Driver = 'blob' | 's3' | 'local';
export function driver(): Driver {
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'blob';
  if (process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) return 's3';
  return 'local';
}
export const storageDurable = () => driver() !== 'local';

// ---- content sniffing ----
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/webm': 'weba',
};

export function sniff(b: Uint8Array): string | null {
  const s = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && s(1, 3) === 'PNG') return 'image/png';
  if (s(0, 4) === 'GIF8') return 'image/gif';
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return 'image/webp';
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WAVE') return 'audio/wav';
  if (s(0, 4) === 'OggS') return 'audio/ogg';
  if (s(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
  if (s(4, 4) === 'ftyp') {
    const brand = s(8, 4);
    if (brand.startsWith('M4A')) return 'audio/mp4';
    if (brand === 'qt  ') return 'video/quicktime';
    return 'video/mp4';
  }
  return null;
}

export const kindOf = (contentType: string): MediaKind | null =>
  contentType.startsWith('image/') ? 'image' : contentType.startsWith('video/') ? 'video' : contentType.startsWith('audio/') ? 'audio' : null;

/** Validates bytes by magic number (never trusts the declared type) and size. */
export function validate(bytes: Uint8Array, allowed: MediaKind[]) {
  const type = sniff(bytes);
  const kind = type && kindOf(type);
  if (!type || !kind || !allowed.includes(kind)) throw new HttpError(415, `Unsupported file type. Allowed: ${allowed.join(', ')}`);
  if (bytes.byteLength > LIMITS[kind]) throw new HttpError(413, `${kind} exceeds ${Math.round(LIMITS[kind] / 1048576)} MB`);
  return {type, kind};
}

const newKey = (folder: string, type: string) =>
  `${folder.replace(/[^a-z0-9/-]/gi, '')}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${EXT[type] || 'bin'}`;

// ---- drivers ----
const localRoot = () => path.join(process.env.DATA_DIR || path.join(process.cwd(), '.data'), 'media');

function s3() {
  const region = process.env.S3_REGION || 'auto';
  const endpoint = (process.env.S3_ENDPOINT || `https://s3.${region}.amazonaws.com`).replace(/\/$/, '');
  return {
    client: new AwsClient({accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!, region, service: 's3'}),
    url: (key: string) => `${endpoint}/${process.env.S3_BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`,
    publicUrl: (key: string) => process.env.S3_PUBLIC_BASE_URL
      ? `${process.env.S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`
      : `${endpoint}/${process.env.S3_BUCKET}/${key}`,
  };
}

export async function putBytes(folder: string, bytes: Uint8Array, contentType: string): Promise<MediaRef> {
  const key = newKey(folder, contentType);
  const d = driver();
  if (d === 'blob') {
    const r = await blobPut(key, Buffer.from(bytes), {access: 'public', contentType, addRandomSuffix: false});
    return {url: r.url, key, durable: true, contentType};
  }
  if (d === 's3') {
    const c = s3();
    const r = await c.client.fetch(c.url(key), {method: 'PUT', body: bytes as BodyInit, headers: {'Content-Type': contentType, 'Content-Length': String(bytes.byteLength)}});
    if (!r.ok) throw new HttpError(502, `Object storage upload failed (${r.status})`);
    return {url: c.publicUrl(key), key, durable: true, contentType};
  }
  const file = path.join(localRoot(), key);
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, bytes);
  return {url: `/api/files/${key}`, key, durable: false, contentType};
}

/** True when the URL already points at our own durable storage. */
export function isOwnStorageUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (driver() === 'blob' && isBlobHost(u.host)) return true;
    const base = process.env.S3_PUBLIC_BASE_URL;
    if (base && raw.startsWith(base.replace(/\/$/, '') + '/')) return true;
  } catch {}
  return false;
}

/**
 * Copies a generated file (worker URL) into durable storage. Returns the original URL with
 * durable:false when no durable store is configured, so callers never claim durability falsely.
 */
export async function ingestRemote(raw: string, folder: string, allowed: MediaKind[], {trustedOnly = true} = {}): Promise<MediaRef> {
  if (isOwnStorageUrl(raw)) return {url: raw, durable: true};
  if (!storageDurable()) return {url: raw, durable: false};
  const u = await assertSafeUrl(raw, {trustedOnly});
  const headers: Record<string, string> = {'ngrok-skip-browser-warning': 'true'};
  const gpu = process.env.GPU_API_URL;
  if (gpu && process.env.GPU_API_KEY && u.host === new URL(gpu).host) headers.Authorization = `Bearer ${process.env.GPU_API_KEY}`;
  const r = await fetch(u, {headers, redirect: 'error', signal: AbortSignal.timeout(120_000)});
  if (!r.ok || !r.body) throw new Error(`Could not download generated media (${r.status})`);
  const max = Math.max(...allowed.map(k => LIMITS[k]));
  const declared = Number(r.headers.get('content-length') || 0);
  if (declared > max) throw new Error('Generated media is larger than the storage limit');
  // Buffer with a hard cap (S3 needs a length; clips are tens of MB).
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > max) throw new Error('Generated media is larger than the storage limit');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const {type} = validate(bytes, allowed);
  return putBytes(folder, bytes, type);
}

// ---- local serving (dev) ----
export async function openLocal(key: string) {
  if (!/^[a-z0-9/-]+\/[0-9-]+\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i.test(key) || key.includes('..')) throw new HttpError(400, 'Invalid file key');
  const file = path.join(localRoot(), key);
  if (!file.startsWith(localRoot() + path.sep)) throw new HttpError(400, 'Invalid file key');
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) throw new HttpError(404, 'File not found');
  const ext = path.extname(file).slice(1);
  const type = Object.entries(EXT).find(([, e]) => e === ext)?.[0] || 'application/octet-stream';
  return {size: stat.size, type, stream: (start?: number, end?: number) => Readable.toWeb(createReadStream(file, {start, end})) as ReadableStream};
}
