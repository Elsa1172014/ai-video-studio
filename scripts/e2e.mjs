// End-to-end acceptance run against a running web app + GPU worker.
//   BASE_URL=http://localhost:3000 node scripts/e2e.mjs
// With the stub worker (scripts/stubs) this verifies the full pipeline up to the provider
// boundary; it does NOT prove real model quality. Exits non-zero on the first failure.
import {execFileSync} from 'child_process';
import {mkdtempSync, readFileSync} from 'fs';
import {tmpdir} from 'os';
import path from 'path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const AUTH = process.env.STUDIO_PASSWORD ? {Authorization: 'Basic ' + Buffer.from(':' + process.env.STUDIO_PASSWORD).toString('base64')} : {};
const log = (...a) => console.log('•', ...a);
const assert = (c, m) => {if (!c) {console.error('✗', m); process.exit(1);} console.log('  ✓', m);};

async function call(method, url, json, raw) {
  const r = await fetch(BASE + url, {method, headers: {...AUTH, ...(json ? {'Content-Type': 'application/json'} : {})}, body: raw || (json ? JSON.stringify(json) : undefined)});
  const t = await r.text(); let d; try {d = JSON.parse(t);} catch {d = t;}
  if (!r.ok && !call.allow) throw new Error(`${method} ${url} -> ${r.status} ${t.slice(0, 300)}`);
  return Object.assign(d ?? {}, {_status: r.status});
}
const get = u => call('GET', u), post = (u, j) => call('POST', u, j), patch = (u, j) => call('PATCH', u, j), put = (u, j) => call('PUT', u, j);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitJobs(kind, id, ids, timeout = 600_000) {
  const t0 = Date.now();
  for (;;) {
    const jobs = await Promise.all(ids.map(j => get(`/api/jobs/${j}`)));
    if (jobs.every(j => !['queued', 'processing'].includes(j.status))) return jobs;
    if (Date.now() - t0 > timeout) throw new Error('jobs timed out');
    await sleep(1500);
  }
}

async function produce(kind, id, scenes, {withAudio = true} = {}) {
  const ids = [];
  for (const s of scenes) for (const sh of s.shots) ids.push((await post('/api/jobs', {ownerKind: kind, ownerId: id, type: 'video', sceneId: s.id, shotId: sh.id})).job.id);
  if (withAudio) for (const s of scenes) if (s.narration.trim() || s.dialogue.length) ids.push((await post('/api/jobs', {ownerKind: kind, ownerId: id, type: 'audio', sceneId: s.id})).job.id);
  return waitJobs(kind, id, ids);
}

function probe(url) {
  const dir = mkdtempSync(path.join(tmpdir(), 'e2e-'));
  const file = path.join(dir, 'final.mp4');
  execFileSync('curl', ['-sf', '-o', file, url.startsWith('http') ? url : BASE + url]);
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', file]).toString());
}

// ---------------- Series ----------------
log('SERIES');
const series = await post('/api/series', {title: 'E2E Library Mystery', language: 'en', aspectRatio: '16:9', style: 'warm 3D animation', narratorVoice: {provider: 'tts', voiceId: 'narrator-1'}});
assert(series.id, 'series created');
const omar = await post(`/api/series/${series.id}/characters`, {name: 'Omar', role: 'curious student', age: '12', appearance: 'round face, brown eyes, short black hair', wardrobe: 'white kandura', negativeConstraints: 'no glasses', voice: {provider: 'tts', voiceId: 'omar-v1'}});
const mariam = await post(`/api/series/${series.id}/characters`, {name: 'Mariam', role: 'best friend', age: '11', appearance: 'oval face, green eyes', wardrobe: 'navy abaya', voice: {provider: 'tts', voiceId: 'mariam-v1'}});
assert(omar.id && mariam.id, 'characters added');

const img = path.join(mkdtempSync(path.join(tmpdir(), 'e2e-img-')), 'omar.jpg');
execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=orange:s=512x512', '-frames:v', '1', '-y', img]);
const form = new FormData(); form.set('file', new Blob([readFileSync(img)], {type: 'image/jpeg'}), 'omar.jpg');
const ref = await (await fetch(BASE + '/api/media', {method: 'POST', body: form, headers: AUTH})).json();
assert(ref.url && !ref.url.startsWith('blob:'), `reference image stored (${ref.durable ? 'durable' : 'local dev store'})`);
await patch(`/api/series/${series.id}/characters/${omar.id}`, {referenceImage: ref});
await post(`/api/series/${series.id}/characters/${omar.id}/lock`, {locked: true});
await post(`/api/series/${series.id}/characters/${mariam.id}/lock`, {locked: true});
call.allow = true;
const blocked = await patch(`/api/series/${series.id}/characters/${omar.id}`, {wardrobe: 'red hoodie'});
call.allow = false;
assert(blocked._status === 409, 'locked identity field change rejected with 409');

const ep1 = await post(`/api/series/${series.id}/episodes`, {title: 'The Map', minutes: 0.5, goal: 'Omar finds an old map hidden in a library book.\nOmar: Mariam, look at this!\nMariam: It shows the basement!\nThey hear footsteps behind the shelves FAILONCE.'});
const ep1b = await post(`/api/episodes/${ep1.id}/storyboard`);
const scenes1 = ep1b.storyboard.scenes;
assert(scenes1.length >= 1, `storyboard: ${scenes1.length} scenes, planner=${ep1b.storyboard.planner}`);
const prompts = scenes1.flatMap(s => s.shots.map(x => x.prompt)).join('\n');
assert(prompts.includes('white kandura') && prompts.includes('navy abaya'), 'locked character identity reaches scene prompts');
assert(scenes1.some(s => s.referenceImageUrl === ref.url), 'reference image attached to scenes with Omar');
assert(scenes1.flatMap(s => s.dialogue).some(d => d.speakerId === omar.id), 'dialogue mapped to canonical characters');

let jobs = await produce('episode', ep1.id, scenes1);
const failed = jobs.filter(j => j.status === 'failed');
assert(failed.length === 1 && /simulated GPU failure/.test(failed[0].error), 'one shot failed (simulated), others completed');
const audio = jobs.filter(j => j.type === 'audio');
assert(audio.every(j => j.status === 'completed'), 'scene voice tracks completed');
assert(audio.some(j => j.input.segments.some(s => s.voice === 'omar-v1')) && audio.some(j => j.input.segments.some(s => s.voice === 'mariam-v1')), 'dialogue uses each character\'s locked voice');

const retried = await post(`/api/jobs/${failed[0].id}/retry`);
const [afterRetry] = await waitJobs('episode', ep1.id, [retried.id]);
assert(afterRetry.status === 'completed' && afterRetry.attempts === 2, 'retry of the single failed shot succeeded (attempt 2)');

const view = await get(`/api/productions/episode/${ep1.id}`);
const completedBefore = view.jobs.filter(j => j.type === 'video' && j.status === 'completed').length;
assert(completedBefore === scenes1.reduce((n, s) => n + s.shots.length, 0), 'all shot jobs persisted and reloadable (refresh-safe)');
const again = await post('/api/jobs', {ownerKind: 'episode', ownerId: ep1.id, type: 'video', sceneId: scenes1[0].id, shotId: scenes1[0].shots[0].id});
assert(again.job.id === view.jobs.find(j => j.shotId === scenes1[0].shots[0].id && j.status === 'completed').id, 'completed clip is not regenerated');

const render = (await post('/api/jobs', {ownerKind: 'episode', ownerId: ep1.id, type: 'render'})).job;
const [rendered] = await waitJobs('episode', ep1.id, [render.id]);
assert(rendered.status === 'completed', 'final render completed: ' + rendered.output?.url);
const info = probe(rendered.output.url);
assert(info.streams.some(s => s.codec_type === 'audio') && info.streams.some(s => s.codec_type === 'video' && s.width === 1280), `final MP4 has video 1280w + audio, ${Number(info.format.duration).toFixed(1)}s`);
assert((await get(`/api/productions/episode/${ep1.id}`)).status === 'completed', 'episode marked completed only after render');

const draft = await post(`/api/episodes/${ep1.id}/memory/draft`);
await put(`/api/episodes/${ep1.id}/memory`, {...draft, unresolvedThreads: ['Who is walking behind the shelves?'], finalSceneState: 'Omar hides the map inside his kandura pocket', nextEpisodeNotes: 'Mariam now distrusts the librarian', source: 'manual', savedAt: undefined});
const ep2 = await post(`/api/series/${series.id}/episodes`, {title: 'The Basement', minutes: 0.5, goal: 'Omar and Mariam sneak into the basement.\nMariam: Do you still have the map?'});
assert(ep2.number === 2, 'episode 2 numbered automatically');
const ctx = await get(`/api/series/${series.id}/context?episode=2`);
assert(ctx.continuity.includes('kandura pocket') && ctx.continuity.includes('behind the shelves'), 'episode 2 receives episode 1 memory automatically');
assert(ctx.characters.find(c => c.id === omar.id)?.voice.voiceId === 'omar-v1' && ctx.characters.every(c => c.locked), 'same locked characters and voices load for episode 2');
const ep2b = await post(`/api/episodes/${ep2.id}/storyboard`);
assert(ep2b.storyboard.scenes[0].shots[0].prompt.includes('kandura pocket'), 'episode 2 prompts carry continuity');

// ---------------- Educational ----------------
log('EDUCATIONAL');
const source = 'Water boils at 100 degrees Celsius at sea level. When water is heated, its molecules move faster.\n\nLiquid water turns into vapour through evaporation. Condensation happens when vapour cools and becomes liquid again.';
const project = await post('/api/projects', {title: 'The Water Cycle', sourceText: source, minutes: 0.5});
const pb = await post(`/api/projects/${project.id}/storyboard`);
const narr = pb.storyboard.scenes.map(s => s.narration).join(' ');
assert(source.split(/(?<=\.)\s+|\n+/).filter(Boolean).every(s => narr.includes(s.trim())), 'every source sentence preserved verbatim in narration');
jobs = await produce('project', project.id, pb.storyboard.scenes);
assert(jobs.every(j => j.status === 'completed'), 'lesson clips and narration completed');
const pr = (await post('/api/jobs', {ownerKind: 'project', ownerId: project.id, type: 'render'})).job;
const [prDone] = await waitJobs('project', project.id, [pr.id]);
assert(prDone.status === 'completed' && probe(prDone.output.url).streams.some(s => s.codec_type === 'audio'), 'lesson final MP4 rendered with narration');
const reopened = await get(`/api/projects/${project.id}`);
assert(reopened.storyboard.scenes.length === pb.storyboard.scenes.length && (await get(`/api/productions/project/${project.id}`)).final.status === 'completed', 'lesson project, storyboard and final video persist');

console.log('\nE2E PASSED');
