// End-to-end check of Story Studio in a real browser against the real worker (see fake_gpu.py for what is simulated).
//   npm run build && node e2e/story-studio.mjs        (needs: worker deps in $PYTHON, ffmpeg, global playwright + chromium)
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const require = createRequire(join(execSync('npm root -g').toString().trim(), 'x.js'));
const { chromium } = require('playwright');
const ROOT = resolve(import.meta.dirname, '..');
const PYTHON = process.env.PYTHON || 'python3';
const SHOTS = process.env.SHOTS || mkdtempSync(join(tmpdir(), 'shots-'));
mkdirSync(SHOTS, { recursive: true });
const OUT = mkdtempSync(join(tmpdir(), 'gpu-out-'));
const GPU = 8765, WEB = 3188, TOTAL = Number(process.env.TOTAL || 60);
const procs = [];
const run = (cmd, args, env, cwd = ROOT) => {
  const p = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  p.stderr.on('data', (d) => process.env.DEBUG && process.stderr.write(d));
  procs.push(p);
  return p;
};
const until = async (fn, ms, what) => { const t = Date.now(); for (;;) { try { const v = await fn(); if (v) return v; } catch {} if (Date.now() - t > ms) throw new Error('timeout: ' + what); await new Promise((r) => setTimeout(r, 300)); } };
const log = (...a) => console.log('•', ...a);
let failed = 0;
const check = (ok, what) => { console.log(ok ? '  ✓' : '  ✗', what); if (!ok) failed++; };

try {
  run(PYTHON, ['e2e/fake_gpu.py'], { OUTPUT_DIR: OUT, JOB_DIR: join(OUT, 'jobs'), GPU_API_KEY: 'k', PUBLIC_OUTPUT_BASE_URL: `http://127.0.0.1:${GPU}`, PORT: String(GPU), FAKE_LATENCY: process.env.FAKE_LATENCY || '1.5' });
  run('npx', ['next', 'start', '-p', String(WEB)], { GPU_API_URL: `http://127.0.0.1:${GPU}`, GPU_API_KEY: 'k', RUNPOD_ENDPOINT_ID: '', RUNPOD_API_KEY: '' });
  await until(() => fetch(`http://127.0.0.1:${GPU}/health`).then((r) => r.ok), 30000, 'worker');
  await until(() => fetch(`http://127.0.0.1:${WEB}/create`).then((r) => r.ok), 60000, 'web');

  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium/chrome-linux/chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] }).catch(() => chromium.launch({ args: ['--no-sandbox'] }));
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text()) && errors.push(m.text()));

  log('step 1: write story + exact length');
  await page.goto(`http://127.0.0.1:${WEB}/create`);
  await page.fill('#st-story', 'في قرية صغيرة عاش الطفل عمر وأخته مريم. كان عمر يحب المغامرة والاكتشاف. وفي يوم وجد عمر خريطة قديمة في المكتبة. قررت مريم مساعدة عمر في البحث عن الكنز. وفي النهاية تعلما أن التعاون أجمل من الفوز وحدك. العبرة: التعاون يصنع المستحيل.');
  // Typing only seconds must normalise (60 s → 1:00, never clamp to 59), because the chosen length is exact.
  const [mins, secs] = await page.locator('.st-dial-fields input').all();
  await mins.fill('0');
  await secs.fill(String(TOTAL));
  const clock = `${Math.floor(TOTAL / 60)}:${String(TOTAL % 60).padStart(2, '0')}`;
  check((await page.locator('.st-clock').first().textContent()) === clock, `${TOTAL} typed in the seconds box reads ${clock}`);
  check(Number(await page.locator('.st-dial-fields .is-total input').inputValue()) === TOTAL, 'total-seconds box shows the same length');
  await page.screenshot({ path: join(SHOTS, '1-write.png'), fullPage: true });
  await page.getByRole('button', { name: 'حلّل القصة' }).click();

  log('step 2: detected cast + message');
  await page.waitForSelector('.st-char');
  const names = await page.locator('.st-char .st-char-body label:first-child input').evaluateAll((els) => els.map((e) => e.value));
  check(names.includes('عمر') && names.includes('مريم'), `characters detected: ${names.join(', ')}`);
  check((await page.locator('.st-grid2 input').nth(3).inputValue()).includes('التعاون'), 'moral extracted');
  await page.screenshot({ path: join(SHOTS, '2-cast.png'), fullPage: true });
  await page.getByRole('button', { name: /القصة المصوّرة/ }).last().click();

  log('step 3: storyboard');
  await page.waitForSelector('.st-frame');
  const sceneCount = await page.locator('.st-frame').count();
  const durations = await page.locator('.st-frame time').allTextContents();
  const sum = durations.reduce((n, t) => { const [m, s] = t.split(':').map(Number); return n + m * 60 + s; }, 0);
  check(sum === TOTAL, `${sceneCount} scenes add up to exactly ${TOTAL}s (got ${sum}s)`);
  check((await page.locator('.st-reel svg [role=button]').count()) === sceneCount, 'ring has one arc per scene');
  await page.screenshot({ path: join(SHOTS, '3-board.png'), fullPage: true });
  await page.getByRole('button', { name: /أنتج/ }).last().click();

  log('step 4: production');
  await page.getByRole('button', { name: 'ابدأ الإنتاج' }).click();
  await page.waitForSelector('.st-arc.is-generating');
  check(true, 'a scene is shown as generating');
  await page.screenshot({ path: join(SHOTS, '4-generating.png'), fullPage: true });
  const seen = new Set();
  await until(async () => {
    const pct = Number((await page.locator('.st-pct').first().textContent()).replace('%', ''));
    seen.add(pct);
    return await page.locator('.st-final video').count();
  }, 120000, 'final video');
  const pcts = [...seen].sort((a, b) => a - b);
  check(pcts.length >= sceneCount, `progress advanced in real steps: ${pcts.join('% → ')}%`);
  await page.waitForFunction(() => document.querySelector('.st-pct')?.textContent?.startsWith('100'), null, { timeout: 15000 });
  check(true, 'ring reached 100%');
  const done = await page.locator('.st-arc.is-done').count();
  check(done === sceneCount, `all ${sceneCount} arcs are done`);
  await page.screenshot({ path: join(SHOTS, '5-done.png'), fullPage: true });

  log('verify the real output');
  const src = await page.locator('.st-final video').getAttribute('src');
  const bytes = Buffer.from(await (await fetch(`http://127.0.0.1:${WEB}${src}`)).arrayBuffer());
  const file = join(OUT, 'final-check.mp4');
  writeFileSync(file, bytes);
  const probe = execSync(`ffmpeg -i ${file} 2>&1 || true`).toString();
  const [, h, m, s] = probe.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const seconds = Number(h) * 3600 + Number(m) * 60 + Number(s);
  check(Math.abs(seconds - TOTAL) <= 0.15, `final video is ${seconds.toFixed(2)}s for a requested ${TOTAL}s`);
  check(/Video: h264/.test(probe), 'final video is H.264 MP4');

  const calls = readFileSync(join(OUT, 'calls.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const chained = calls.filter((c) => c.imageUrl && /\.jpg$/.test(c.imageUrl));
  check(calls.length >= sceneCount, `worker received ${calls.length} generate calls`);
  check(chained.length >= 1, `${chained.length} continuing scene(s) started from the previous scene's last frame`);

  log('mobile layout (390 px)');
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check((await overflow()) <= 1, 'produce step has no horizontal page scroll');
  await page.screenshot({ path: join(SHOTS, '6-mobile-produce.png'), fullPage: true });
  await page.locator('.st-rail button').nth(2).click();
  await page.waitForSelector('.st-frame');
  check((await overflow()) <= 1, 'storyboard step has no horizontal page scroll');
  await page.screenshot({ path: join(SHOTS, '7-mobile-board.png'), fullPage: true });
  await page.locator('.st-rail button').nth(0).click();
  check((await overflow()) <= 1, 'write step has no horizontal page scroll');

  check(errors.length === 0, 'no browser console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
} catch (e) {
  console.error('E2E ERROR:', e.message);
  failed++;
} finally {
  procs.forEach((p) => { try { process.kill(-p.pid, 'SIGTERM'); } catch {} }); // whole process group: npx leaves a child behind
}
console.log(failed ? `\nFAILED (${failed})` : '\nALL CHECKS PASSED', '\nscreenshots:', SHOTS);
process.exit(failed ? 1 : 0);
