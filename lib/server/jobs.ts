// Persisted generation jobs (video shot, scene audio, final render) with retry, cancel,
// timeout and resume-after-refresh. Jobs are the single source of truth for clip state.
import {createHash} from 'crypto';
import * as db from './db';
import {HttpError, newId, notFound} from './http';
import * as gpu from './gpu';
import {ingestRemote} from './storage';
import {defaultVoice, frame, jobTimeoutMs, ttsProvider, videoProvider} from './config';
import type {AspectRatio, Character, Job, JobType, OwnerKind, ProductionStatus, ProductionView, Scene, Storyboard, VoiceRef} from '@/lib/types';
import {getEpisode, listCharacters, getSeries} from './series';
import {getProject} from './projects';

const now = () => new Date().toISOString();
const ACTIVE = new Set(['queued', 'processing']);
export const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 24);

// ---------- owners (episode / educational project) ----------
type Owner = {
  kind: OwnerKind; id: string; seriesId?: string; storyboard?: Storyboard; aspectRatio: AspectRatio;
  language: 'ar' | 'en'; narratorVoice?: VoiceRef; characters: Character[];
};

export async function loadOwner(kind: OwnerKind, id: string): Promise<Owner> {
  if (kind === 'episode') {
    const e = await getEpisode(id);
    const [s, characters] = await Promise.all([getSeries(e.seriesId), listCharacters(e.seriesId)]);
    return {kind, id, seriesId: e.seriesId, storyboard: e.storyboard, aspectRatio: e.aspectRatio, language: s.language, narratorVoice: s.narratorVoice, characters};
  }
  const p = await getProject(id);
  return {kind, id, storyboard: p.storyboard, aspectRatio: p.aspectRatio, language: p.language, narratorVoice: p.narratorVoice, characters: []};
}

export const listJobs = async (ownerId: string) =>
  (await db.list<Job>('job', ownerId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

const latest = (jobs: Job[], f: (j: Job) => boolean) => jobs.filter(f).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

// ---------- inputs ----------
function sceneOf(o: Owner, sceneId: string): Scene {
  const s = o.storyboard?.scenes.find(x => x.id === sceneId);
  if (!s) throw notFound('Scene');
  return s;
}

function videoInput(o: Owner, scene: Scene, shotId: string) {
  const shot = scene.shots.find(x => x.id === shotId);
  if (!shot) throw notFound('Shot');
  const {width, height} = frame(o.aspectRatio);
  return {provider: videoProvider(), prompt: shot.prompt, duration: shot.duration, width, height, ...(scene.referenceImageUrl ? {imageUrl: scene.referenceImageUrl} : {})};
}

/** Maps narration to the narrator voice and each dialogue line to the speaker's locked voice. */
export function audioInput(o: Owner, scene: Scene) {
  const narrator = o.narratorVoice || {provider: ttsProvider(), voiceId: defaultVoice()};
  const segments: {text: string; voice: string; provider: string; speaker: string}[] = [];
  const warnings: string[] = [];
  if (scene.narration.trim()) segments.push({text: scene.narration.trim(), voice: narrator.voiceId, provider: narrator.provider, speaker: 'Narrator'});
  for (const d of scene.dialogue) {
    const c = o.characters.find(x => x.id === d.speakerId) || o.characters.find(x => x.name.toLowerCase() === d.speaker.toLowerCase());
    const v = c?.voice;
    if (!v) warnings.push(`${d.speaker} has no voice assigned; the narrator voice was used.`);
    segments.push({text: d.text, voice: (v || narrator).voiceId, provider: (v || narrator).provider, speaker: d.speaker});
  }
  if (!segments.length) throw new HttpError(400, 'This scene has no narration or dialogue to voice');
  return {input: {language: o.language, segments, targetSeconds: scene.duration}, warnings};
}

function renderInput(o: Owner, jobs: Job[]) {
  const scenes = o.storyboard?.scenes || [];
  if (!scenes.length) throw new HttpError(400, 'Nothing to render: build the storyboard first');
  const missing: string[] = [];
  const parts = scenes.map(s => {
    const clips = s.shots.map(sh => latest(jobs, j => j.type === 'video' && j.shotId === sh.id && j.status === 'completed'));
    if (clips.some(c => !c)) missing.push(`scene ${s.index + 1}`);
    const audio = latest(jobs, j => j.type === 'audio' && j.sceneId === s.id && j.status === 'completed' && j.inputHash === hash(audioInput(o, s).input));
    return {sceneId: s.id, duration: s.duration, clips: clips.map(c => c?.output?.url || ''), audio: audio?.output?.url};
  });
  if (missing.length) throw new HttpError(409, `Generate all clips before the final render. Missing: ${missing.join(', ')}`);
  const f = frame(o.aspectRatio);
  return {scenes: parts, width: f.renderWidth, height: f.renderHeight, fps: 24};
}

// ---------- lifecycle ----------
async function submitJob(job: Job): Promise<Job> {
  const action = job.type === 'video' ? 'generate' : job.type === 'audio' ? 'voice' : 'render';
  try {
    const r = await gpu.submit(action, job.input);
    job = {...job, providerJobId: r.providerJobId, status: r.status, error: r.status === 'failed' ? r.message : undefined, submittedAt: now(), updatedAt: now()};
    if (r.status === 'completed' && r.outputUrl) job = await finish(job, r.outputUrl);
  } catch (e) {
    job = {...job, status: 'failed', error: e instanceof Error ? e.message : 'Submission failed', updatedAt: now()};
  }
  return db.put('job', job.id, job.ownerId, job);
}

async function finish(job: Job, outputUrl: string): Promise<Job> {
  const allowed = job.type === 'audio' ? ['audio' as const] : ['video' as const];
  try {
    const output = await ingestRemote(outputUrl, `${job.ownerKind}s/${job.ownerId}/${job.type}`, allowed);
    return {...job, status: 'completed', output, error: undefined, completedAt: now(), updatedAt: now()};
  } catch (e) {
    return {...job, status: 'failed', error: `Generated, but saving to storage failed: ${e instanceof Error ? e.message : e}`, updatedAt: now()};
  }
}

export async function createJob(kind: OwnerKind, ownerId: string, req: {type: JobType; sceneId?: string; shotId?: string; force?: boolean}) {
  const o = await loadOwner(kind, ownerId);
  const jobs = await listJobs(ownerId);
  let input: Record<string, unknown>, sceneId: string | undefined, shotId: string | undefined, warnings: string[] = [];
  if (req.type === 'video') {
    if (!req.sceneId || !req.shotId) throw new HttpError(400, 'sceneId and shotId are required');
    const scene = sceneOf(o, req.sceneId);
    input = videoInput(o, scene, req.shotId); sceneId = scene.id; shotId = req.shotId;
  } else if (req.type === 'audio') {
    if (!req.sceneId) throw new HttpError(400, 'sceneId is required');
    const scene = sceneOf(o, req.sceneId);
    ({input, warnings} = audioInput(o, scene)); sceneId = scene.id;
  } else {
    input = renderInput(o, jobs);
  }
  const inputHash = hash(input);
  // Idempotent: never start a duplicate or regenerate a finished clip unless forced.
  const existing = latest(jobs, j => j.type === req.type && j.inputHash === inputHash && (ACTIVE.has(j.status) || (j.status === 'completed' && !req.force)));
  if (existing) return {job: existing, warnings};
  const job: Job = {
    id: newId(), ownerKind: kind, ownerId, seriesId: o.seriesId, sceneId, shotId, type: req.type,
    provider: req.type === 'video' ? String(input.provider) : req.type === 'audio' ? ttsProvider() : 'ffmpeg',
    status: 'queued', attempts: 1, input, inputHash, createdAt: now(), updatedAt: now(),
  };
  await db.put('job', job.id, ownerId, job);
  return {job: await submitJob(job), warnings};
}

export async function getJob(id: string) {
  const j = await db.get<Job>('job', id);
  if (!j) throw notFound('Job');
  return j;
}

/** Polls the provider for an active job, applies the timeout, and persists the outcome. */
export async function refreshJob(id: string): Promise<Job> {
  let job = await getJob(id);
  if (!ACTIVE.has(job.status) || !job.providerJobId) return job;
  const started = Date.parse(job.submittedAt || job.createdAt);
  if (Date.now() - started > jobTimeoutMs(job.type)) {
    await gpu.cancel(job.providerJobId);
    job = {...job, status: 'failed', error: `Timed out after ${Math.round(jobTimeoutMs(job.type) / 60000)} min. Retry the job.`, updatedAt: now()};
    return db.put('job', job.id, job.ownerId, job);
  }
  let r: gpu.GpuResult;
  try {r = await gpu.status(job.providerJobId);}
  catch (e) {return {...job, error: e instanceof Error ? e.message : 'Status check failed'};} // transient: keep polling
  if (r.status === job.status && !r.outputUrl) return job;
  if (r.status === 'completed' && r.outputUrl) job = await finish(job, r.outputUrl);
  else job = {...job, status: r.status, error: r.status === 'failed' ? r.message || 'Generation failed' : undefined, updatedAt: now()};
  return db.put('job', job.id, job.ownerId, job);
}

export async function retryJob(id: string) {
  const job = await getJob(id);
  if (ACTIVE.has(job.status)) throw new HttpError(409, 'Job is still running');
  const next: Job = {...job, status: 'queued', attempts: job.attempts + 1, error: undefined, output: undefined, providerJobId: undefined, completedAt: undefined, updatedAt: now()};
  await db.put('job', id, job.ownerId, next);
  return submitJob(next);
}

export async function cancelJob(id: string) {
  const job = await getJob(id);
  if (!ACTIVE.has(job.status)) return job;
  if (job.providerJobId) await gpu.cancel(job.providerJobId);
  return db.put('job', id, job.ownerId, {...job, status: 'cancelled', error: 'Cancelled by user', updatedAt: now()});
}

// ---------- production view ----------
export async function production(kind: OwnerKind, id: string): Promise<ProductionView> {
  const o = await loadOwner(kind, id);
  const all = await listJobs(id);
  // Only jobs that belong to the current storyboard (shots/scenes may have been regenerated).
  const shotIds = new Set(o.storyboard?.scenes.flatMap(s => s.shots.map(x => x.id)) || []);
  const sceneIds = new Set(o.storyboard?.scenes.map(s => s.id) || []);
  const jobs = all.filter(j => (j.type === 'video' ? shotIds.has(j.shotId || '') : j.type === 'audio' ? sceneIds.has(j.sceneId || '') : true));
  const final = latest(jobs, j => j.type === 'render');
  let status: ProductionStatus = !o.storyboard ? 'draft' : 'storyboard';
  if (jobs.some(j => j.type !== 'render' && ACTIVE.has(j.status))) status = 'generating';
  else if (final && ACTIVE.has(final.status)) status = 'rendering';
  else if (final?.status === 'completed') status = 'completed';
  else if (jobs.some(j => j.type === 'video') && jobs.filter(j => j.type === 'video').every(j => j.status === 'failed')) status = 'failed';
  return {kind, id, status, jobs, final};
}
