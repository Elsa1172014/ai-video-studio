# Verification — 10 October 2026

Project: PR #5, feature/claude-complete-vast-integration. Production remains on main. This report was updated after successful browser sign-in and free infrastructure preparation.

Passed locally:
- npm ci
- npm run typecheck
- npm test: 16 tests, 2 files
- npm run build: Next.js 15.5.27
- python -m compileall -q worker
- Python tests: 6 passed (Wan CLI, readiness, Edge voice IDs, timeout and partial audio cleanup)
- bash -n scripts/setup-wan-vast.sh scripts/start-wan-vast.sh scripts/run-fixture-e2e.sh
- Full fixture E2E: series creation, identity lock, image upload, per-speaker voices, simulated failure/retry, refresh persistence, ordered render, 30-second 1280-wide MP4 with audio, second-episode continuity, Educational source preservation and final MP4.

Implementation: official Wan 2.2 TI2V-5B bridge, pinned setup and localhost startup scripts, worker installation diagnostics, GPU health checks that reject missing CUDA/weights, and keyless Edge preview narration with explicit Arabic/English voices and bounded timeouts. Edge is an online speech service, not voice cloning. Actual Arabic narration produced a valid 24 kHz MP3 of 4.32 seconds, verified by ffprobe. The local execution environment used its trusted CA bundle; TLS verification was preserved. Ordinary GPU-host network access still needs live testing.

Free infrastructure prepared:
- Isolated Neon Free project ai-video-studio-preview in us-east-1. Created studio database/table/index and verified SQL read; saved pooled DATABASE_URL as a server-only Preview secret.
- Saved Vercel Preview GPU_PROVIDER=vast, VIDEO_PROVIDER=wan, MAX_SHOT_SECONDS=5, DEFAULT_VOICE_ID=ar-AE-HamdanNeural and a server-only GPU_API_KEY. Install the same bearer key on the paid host later.
- Created and connected Vercel Hobby Blob store ai-video-studio-preview-media in iad1 after explicit user approval. BLOB_READ_WRITE_TOKEN is sensitive and scoped to Preview only; confirmed via the env metadata API. Public asset URLs can be read by anyone who has the URL: do not upload private/sensitive media under this configuration.
- Confirmed GitHub link, Production main branch, Next.js preset, Node 24, Fluid Compute and active Vercel Authentication for Preview.
- Authenticated Preview loaded. Before the new env deployment it showed GPU pending / Local data / Local media. Production /api/health returned HTTP 200 with GPU false/upstream 404; /api/providers returned HTTP 200 (adapter listings are not model readiness).
- Preparation commit 98fc24bae15340848a105feca3010d75e4ad2103 deployed READY to Vercel Preview. The UI now reports Database. Created an Arabic test project through the browser, confirmed its row in Neon and restored it after reload. No inference was submitted.
- Re-ran the full fixture E2E after the new changes: passed, including a 30-second 1280-wide MP4 with audio, failure/retry, Educational narration and Series continuity. Fixed the fixture runner's output origin (no duplicate /outputs suffix).
- GitHub Actions validation for the implementation passed: https://github.com/Elsa1172014/ai-video-studio/actions/runs/38079576523

- Redeployed Preview with the Blob connection: dpl_CpQ5Yfpo1q6qVXYszDwUYYJf4p8r is READY at commit c03b502d8dbf94f2be21d8574c5d2d5701443521. UI reports Database and Storage.
- Uploaded a synthetic 256x256 PNG through Character Bible, received Saved to durable storage, saved the character, reloaded the page and confirmed the image loaded with naturalWidth/naturalHeight 256. Neon confirms referenceImage.durable=true and the public Blob URL. Retained the clearly named test series 81193ad8-82c2-45df-8a41-67ea60098571 for review; no user media uploaded.
- Latest pre-storage-report GitHub validation passed: https://github.com/Elsa1172014/ai-video-studio/actions/runs/38079861755

Not verified:
- Real Wan inference: the original payment blocker was resolved on 11 October; see the paid-host follow-up below. The authorized test budget is USD 5 total. No weights installed remotely or billable inference submitted.
- The Vercel project/env connector works when teamId is omitted; protected fetch still fails (403). Authenticated browser testing verified actual Preview storage without weakening Deployment Protection.
- After payment: rent the approved GPU, run setup/start, configure valid HTTPS, install the matching worker key and set the real Preview GPU_API_URL. No placeholder URL is inserted.
- Real Wan MP4 playback/seeking/download, real worker restart/resume, narrated Educational production and two-episode Series continuity. Installation flags do not prove model loading/complete weights or inference quality.

Existing GitHub validation at baseline succeeded: https://github.com/Elsa1172014/ai-video-studio/actions/runs/38027423079

All fixture video files were FFmpeg test patterns, not generated Wan footage. Production must remain blocked pending the live acceptance gates in VAST_WAN.md.

Scope note: the working generation paths are Educational Studio and Series Studio. The older /studio page still contains prototype Avatar/Dubbing controls; /api/dub explicitly returns 501. Those optional features are not a completed dubbing/lip-sync product and are not covered by the Wan text-to-video acceptance tests.

## Paid-host follow-up — 11 October 2026

User funded Vast with USD 5 and explicitly approved the A40 rental with auto top-up still enabled. Rented instance 55356791 on verified host 560104: A40 (45 GB visible VRAM), 128.6 GB allocated CPU RAM, 120 GB container disk. Displayed total USD 0.500/hour includes GPU USD 0.467/hour and disk USD 0.034/hour (rounded); bandwidth billed separately. Auto top-up was not disabled and the saved card was retained at the user's request. A bank-side online-shopping restriction is not a verified Vast spending cap.

Created a private PyTorch test template, disabled direct Jupyter HTTPS requiring a local TLS certificate, and removed an invalid port 72299 from its Docker options. After explicit user approval registered a dedicated Ed25519 SSH public key on this instance (key ID 1539128). No private key, GPU bearer key or Jupyter session token is included in this repository.

Actual deployment is blocked by access: local SSH DNS resolution fails and a socket to the displayed machine address returns Network is unreachable. The authenticated Vast console works, but Jupyter gateway navigation repeatedly times out in the cloud browser. Instance logs show base-image startup package installation; no successful application install or CUDA command execution is established.

Stopped GPU after both connection attempts and verified the Inactive/Start instance controls and USD 0.034/hour disk-only rate. Last observed balance USD 4.94. Storage costs continue at about USD 0.80/day while stopped. No Wan weights downloaded, real inference submitted, HTTPS GPU endpoint configured or Production merged. Resuming requires a working remote terminal; do not leave GPU running while access is unresolved.

### User Start attempt and recovery — 11 October, 07:58 UTC

The user pressed Start and the console confirmed Running. Later logs showed service log files and the instance portal startup banner, superseding the earlier incomplete package-installation observation; this is still not proof of working CUDA, Jupyter or Wan. The legacy Jupyter gateway rendered 504 Gateway Time-out. The console Open button reached a 502 Bad Gateway page stating "The remote server does not speak TLS". No certificate warning was bypassed and no authenticated service was weakened.

Rebooted the existing container without deleting data. The console returned to Running and fresh logs showed base services starting. Retested the console-provided Jupyter terminal link after this state change; it still did not load a usable terminal. Local SSH remains unavailable because this execution environment cannot reach the remote network. No installation command or inference job was executed.

Stopped the GPU again and verified Current Status Exited, Intended Status Stopped, the Inactive/Start controls and USD 0.034/hour disk-only pricing. Latest observed credit USD 4.86. Container storage continues costing about USD 0.80/day; automatic top-up and the retained payment method were not changed. The blocker is remote terminal/service access, not unpaid credit. Real GPU setup, HTTPS worker-to-Preview connection and real Wan MP4 acceptance testing remain incomplete. Production remains untouched.
