'use client';
// Small typed fetch helpers for the studio UI.

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: any) {super(message);}
}

export async function api<T = any>(url: string, init?: RequestInit & {json?: unknown}): Promise<T> {
  const {json, ...rest} = init || {};
  const r = await fetch(url, {
    cache: 'no-store',
    ...rest,
    headers: json !== undefined ? {'Content-Type': 'application/json', ...(rest.headers || {})} : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await r.text();
  let data: any = null;
  try {data = text ? JSON.parse(text) : null;} catch {data = {error: text.slice(0, 300)};}
  if (!r.ok) {
    const details = Array.isArray(data?.details) ? `: ${data.details.join('; ')}` : '';
    throw new ApiError(r.status, (data?.error || `Request failed (${r.status})`) + details, data?.details);
  }
  return data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

/** Browser-side downscale so reference photos fit the 4 MB upload limit. */
export async function downscaleImage(file: File, max = 1536): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 3.5 * 1024 * 1024 && /jpe?g|png|webp/.test(file.type)) return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('Image conversion failed'))), 'image/jpeg', 0.9));
}

/** Plays worker-hosted http:// outputs through the same-origin proxy (avoids mixed content). */
export function playable(url?: string) {
  if (!url) return undefined;
  if (url.startsWith('http://') && typeof window !== 'undefined' && window.location.protocol === 'https:') {
    const name = url.split('/').pop()?.split('?')[0];
    if (name && /\.mp4$/i.test(name)) return '/api/video/' + encodeURIComponent(name);
  }
  return url;
}

export function setQuery(params: Record<string, string | undefined>) {
  const u = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {if (v) u.searchParams.set(k, v); else u.searchParams.delete(k);}
  window.history.replaceState(null, '', u.toString());
}
export const getQuery = (k: string) => (typeof window === 'undefined' ? null : new URL(window.location.href).searchParams.get(k));
