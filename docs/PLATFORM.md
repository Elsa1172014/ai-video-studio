# Platform: persistence, jobs, continuity

## Workflows
- **Educational Studio**: Project → Source → Storyboard → Generate → Review/retry → Final render.
  Every source sentence is narrated verbatim (checked); visuals never add facts.
- **Series Studio**: Series → Character Bible → Episode → Storyboard → Generate → Review/retry →
  Final render → Save memory → Next episode (receives that memory automatically).

## Data (server-side)
`lib/server/db.ts` stores JSON documents in one Postgres table (`db/schema.sql`, created on first
use) when `DATABASE_URL` is set, else in `.data/studio.json` (development only).

| kind | parent | holds |
|---|---|---|
| series | – | title, language, aspect ratio, style, narrator voice |
| character | series | identity fields, reference image (durable URL), voice provider/id, lock state |
| episode | series | number, goal/script, storyboard (scenes → shots), structured memory |
| project | – | educational title, source text, storyboard |
| job | episode/project | type, provider, providerJobId, status, attempts, error, output URL/key, timestamps |

**Character lock**: while locked, `name, appearance, age, build, hair, wardrobe, personality,
negativeConstraints, referenceImage, voice` cannot change (API answers 409). Unlock is an explicit
`POST /api/series/:id/characters/:cid/lock {locked:false}`.

**Episode memory**: summary, unresolved threads, events, character states, relationship changes,
locations, wardrobe/props, injuries/objects/knowledge, final scene state, next-episode notes.
Planning episode N loads all canonical characters plus a bounded digest of episodes < N
(latest in full, two before as summaries, older as open threads; ≤1500 chars).

## Jobs
Video (one per shot, ≤ `MAX_SHOT_SECONDS`), audio (one per scene: narrator + each speaker's locked
voice) and render jobs are persisted with the provider job id, so a refresh or redeploy resumes by
polling. Jobs are idempotent per input (completed clips are never regenerated unless forced),
time out (`JOB_TIMEOUT_*_MINUTES`), and can be retried or cancelled individually. A production is
`completed` only after its render job completes.

## Media
`lib/server/storage.ts`: Vercel Blob (`BLOB_READ_WRITE_TOKEN`) or S3-compatible (`S3_*`), local disk
otherwise (dev, served by `/api/files`). Uploads are validated by magic bytes and size (images ≤ 4 MB;
the browser downsizes first). Worker outputs are uploaded by the worker itself when it has the same
`S3_*` settings; otherwise the web app copies them into storage. Every stored media item carries a
`durable` flag and the UI warns when something is not durable.

## Final render (worker/render.py)
Each shot is scaled/padded to the target frame (16:9 1280×720, 9:16 720×1280, 1:1 1080²) at 24 fps;
shots are joined per scene; the scene voice track is laid over it (last frame held if speech is
longer); scenes are joined in order into an MP4 with AAC audio.

## Security
- All API input is validated with Zod and bounded; ids are restricted to `[A-Za-z0-9_-]`.
- Secrets stay server-side; `/api/health` reports configuration status only.
- Server-side fetches of user/worker URLs are limited to http(s), block private/loopback addresses,
  and only trusted media hosts are used for generated outputs. The worker applies the same guard.
- Worker commands receive user text through environment variables, never shell interpolation.
- **No user accounts**: there is no multi-user isolation; everyone with access shares all series and
  projects. Set `STUDIO_PASSWORD` to put the whole app behind HTTP Basic auth, and set
  `GPU_API_KEY` on the HTTP worker.

## Tests
- `npm test`: planner, prompts, continuity, lock, jobs, storage/SSRF helpers (file store, or
  Postgres with `TEST_DATABASE_URL`).
- `npm run test:e2e` (`BASE_URL=...`): both acceptance flows over HTTP. With the stub commands in
  `scripts/stubs/` it verifies the pipeline up to the GPU boundary (test patterns and tones, not real
  generation).
