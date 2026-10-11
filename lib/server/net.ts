// Outbound URL guard (SSRF mitigation) for any server-side fetch of a URL that a
// user or a worker supplied.
import {lookup} from 'dns/promises';
import net from 'net';
import {HttpError} from './http';

function privateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

function hostOf(u?: string) {
  if (!u) return null;
  try {return new URL(u).host.toLowerCase();} catch {return null;}
}

// Hosts we trust to serve generated media: the GPU worker, the worker's public output
// base, the configured storage public base, plus MEDIA_ALLOWED_HOSTS (comma separated).
export function trustedMediaHosts() {
  const hosts = new Set<string>();
  for (const u of [process.env.GPU_API_URL, process.env.PUBLIC_OUTPUT_BASE_URL, process.env.S3_PUBLIC_BASE_URL]) {
    const h = hostOf(u);
    if (h) hosts.add(h);
  }
  for (const h of (process.env.MEDIA_ALLOWED_HOSTS || '').split(',')) if (h.trim()) hosts.add(h.trim().toLowerCase());
  return hosts;
}

export function isBlobHost(host: string) {
  return host.endsWith('.public.blob.vercel-storage.com');
}

/**
 * Throws unless `raw` is an http(s) URL that resolves only to public addresses.
 * `trustedOnly` additionally requires the host to be a configured media host.
 */
export async function assertSafeUrl(raw: string, {trustedOnly = false} = {}) {
  let u: URL;
  try {u = new URL(raw);} catch {throw new HttpError(400, 'Invalid URL');}
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new HttpError(400, 'Only http(s) URLs are allowed');
  if (u.username || u.password) throw new HttpError(400, 'URLs with credentials are not allowed');
  const host = u.host.toLowerCase();
  const trusted = trustedMediaHosts().has(host) || isBlobHost(host);
  if (trustedOnly && !trusted) throw new HttpError(400, `Host ${host} is not an allowed media host (set MEDIA_ALLOWED_HOSTS)`);
  if (trusted) return u; // operator-configured hosts may legitimately be private (e.g. a LAN worker)
  if (u.protocol !== 'https:') throw new HttpError(400, 'Only https URLs are allowed for external media');
  const name = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(name) ? [{address: name}] : await lookup(name, {all: true}).catch(() => []);
  if (!addrs.length) throw new HttpError(400, 'URL host does not resolve');
  if (addrs.some(a => privateIp(a.address))) throw new HttpError(400, 'URL resolves to a private address');
  return u;
}

export const _test = {privateIp};
