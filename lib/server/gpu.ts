// GPU provider client: RunPod Serverless (preferred) or the legacy HTTP worker (worker/main.py).
// Secrets stay server-side; responses are normalised to one status vocabulary.
export type GpuAction = 'generate' | 'voice' | 'render';
export type GpuStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type GpuResult = {providerJobId?: string; status: GpuStatus; outputUrl?: string; message?: string};

export class GpuNotConfigured extends Error {}

export function gpuMode(): 'runpod' | 'legacy' | null {
  if (process.env.GPU_PROVIDER === 'vast') {
    if (!process.env.GPU_API_URL || !process.env.GPU_API_KEY) return null;
    if (process.env.NODE_ENV === 'production' && !process.env.GPU_API_URL.startsWith('https://')) return null;
    return 'legacy';
  }
  if (process.env.GPU_PROVIDER === 'runpod') return process.env.RUNPOD_ENDPOINT_ID && process.env.RUNPOD_API_KEY ? 'runpod' : null;
  if (process.env.RUNPOD_ENDPOINT_ID && process.env.RUNPOD_API_KEY) return 'runpod';
  if (process.env.GPU_API_URL && process.env.GPU_API_KEY) return 'legacy';
  return null;
}
export const GPU_MISSING = 'GPU is not configured. Set RUNPOD_ENDPOINT_ID and RUNPOD_API_KEY (RunPod Serverless), or GPU_API_URL (+ GPU_API_KEY) for the HTTP worker.';

const runpodBase = () => `https://api.runpod.ai/v2/${encodeURIComponent(process.env.RUNPOD_ENDPOINT_ID!)}`;
const legacyBase = () => process.env.GPU_API_URL!.replace(/\/$/, '');
function headers(json = true): Record<string, string> {
  const h: Record<string, string> = json ? {'Content-Type': 'application/json'} : {};
  if (gpuMode() === 'runpod') h.Authorization = `Bearer ${process.env.RUNPOD_API_KEY}`;
  else if (process.env.GPU_API_KEY) h.Authorization = `Bearer ${process.env.GPU_API_KEY}`;
  h['ngrok-skip-browser-warning'] = 'true';
  return h;
}

async function call(url: string, init: RequestInit = {}) {
  let r: Response;
  try {
    r = await fetch(url, {...init, cache: 'no-store', signal: AbortSignal.timeout(30_000)});
  } catch (e) {
    throw new Error(`GPU provider unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }
  const text = await r.text();
  let data: any = null;
  try {data = text ? JSON.parse(text) : null;} catch {}
  if (r.status === 401 || r.status === 403) throw new Error(`GPU authentication failed (${r.status}). Check the GPU credentials configured on the server.`);
  if (!r.ok) {
    const detail = (data?.detail || data?.error || data?.message || text || '').toString().slice(0, 400);
    const err = new Error(`GPU provider returned ${r.status}${detail ? `: ${detail}` : ''}`);
    (err as any).status = r.status;
    throw err;
  }
  return data ?? {};
}

function absolutize(u: string | undefined): string | undefined {
  if (!u) return u;
  if (u.startsWith('/') && gpuMode() === 'legacy') return legacyBase() + u;
  return u;
}

function normalizeRunpod(job: any): GpuResult {
  const raw = String(job?.status || '').toUpperCase();
  const output = job?.output || {};
  const outputUrl = output.outputUrl || output.url;
  const message = output.message || job?.error;
  const base = {providerJobId: job?.id};
  if (raw === 'COMPLETED') {
    if (output.status === 'failed') return {...base, status: 'failed', message: message || 'GPU worker reported a failure'};
    if (!outputUrl) return {...base, status: 'failed', message: 'GPU worker finished without returning an output URL'};
    if (String(outputUrl).startsWith('/')) {
      return {...base, status: 'failed', message: 'GPU finished, but the file only exists on the RunPod volume. Configure S3_* storage (or PUBLIC_OUTPUT_BASE_URL) on the worker so outputs get a public URL.'};
    }
    return {...base, status: 'completed', outputUrl, message};
  }
  if (raw === 'CANCELLED') return {...base, status: 'cancelled', message: 'Cancelled'};
  if (raw === 'FAILED' || raw === 'TIMED_OUT') return {...base, status: 'failed', message: message || raw};
  return {...base, status: raw === 'IN_PROGRESS' ? 'processing' : 'queued', message};
}

function normalizeLegacy(data: any): GpuResult {
  const s = String(data?.status || '').toLowerCase();
  const status: GpuStatus = s === 'completed' ? 'completed' : s === 'failed' ? 'failed' : s === 'processing' ? 'processing' : s === 'cancelled' ? 'cancelled' : 'queued';
  const outputUrl = absolutize(data?.outputUrl || data?.url);
  if (status === 'completed' && !outputUrl) return {providerJobId: data?.jobId, status: 'failed', message: 'GPU worker finished without returning an output URL'};
  return {providerJobId: data?.jobId, status, outputUrl, message: data?.message || data?.error};
}

export async function submit(action: GpuAction, input: Record<string, unknown>): Promise<GpuResult> {
  const mode = gpuMode();
  if (!mode) throw new GpuNotConfigured(GPU_MISSING);
  if (mode === 'runpod') return normalizeRunpod(await call(`${runpodBase()}/run`, {method: 'POST', headers: headers(), body: JSON.stringify({input: {action, ...input}})}));
  return normalizeLegacy(await call(`${legacyBase()}/${action}`, {method: 'POST', headers: headers(), body: JSON.stringify(input)}));
}

export async function status(providerJobId: string): Promise<GpuResult> {
  const mode = gpuMode();
  if (!mode) throw new GpuNotConfigured(GPU_MISSING);
  try {
    if (mode === 'runpod') return normalizeRunpod(await call(`${runpodBase()}/status/${encodeURIComponent(providerJobId)}`, {headers: headers(false)}));
    return normalizeLegacy(await call(`${legacyBase()}/jobs/${encodeURIComponent(providerJobId)}`, {headers: headers(false)}));
  } catch (e) {
    if ((e as any)?.status === 404) return {providerJobId, status: 'failed', message: 'The GPU provider no longer knows this job (expired or worker restarted). Retry the scene.'};
    throw e;
  }
}

export async function cancel(providerJobId: string) {
  const mode = gpuMode();
  if (mode === 'runpod') await call(`${runpodBase()}/cancel/${encodeURIComponent(providerJobId)}`, {method: 'POST', headers: headers()}).catch(() => undefined);
  if (mode === 'legacy') await call(`${legacyBase()}/jobs/${encodeURIComponent(providerJobId)}/cancel`, {method: 'POST', headers: headers()}).catch(() => undefined);
}

export async function health() {
  const mode = gpuMode();
  if (!mode) return {configured: false, ok: false, provider: null as string | null, message: GPU_MISSING};
  try {
    const url = mode === 'runpod' ? `${runpodBase()}/health` : `${legacyBase()}/health`;
    const r = await fetch(url, {headers: headers(false), cache: 'no-store', signal: AbortSignal.timeout(10_000)});
    if (mode === 'legacy' && r.ok) {
      const data = await r.json();
      if (data.ok !== true || data.gpu?.available !== true) return {configured: true, ok: false, provider: mode, message: 'Worker reachable, but CUDA GPU is not ready.'};
      if (process.env.VIDEO_PROVIDER === 'wan' && data.wan?.ready !== true) return {configured: true, ok: false, provider: mode, message: 'Worker reachable, but Wan runtime/weights are not ready.'};
    }
    return {configured: true, ok: r.ok, provider: mode, httpStatus: r.status};
  } catch (e) {
    return {configured: true, ok: false, provider: mode, message: e instanceof Error ? e.message : 'unreachable'};
  }
}

export const _test = {normalizeRunpod, normalizeLegacy};
