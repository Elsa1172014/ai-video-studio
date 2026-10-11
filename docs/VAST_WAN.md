# Vast.ai / Wan 2.2 deployment

The built-in Wan adapter runs the official TI2V-5B CLI when WAN_GENERATE_COMMAND is unset. The custom command remains available for existing deployments and test fixtures.

## Host requirements and setup

Use one CUDA GPU with at least 24 GB VRAM, preferably 48 GB, 64 GB CPU RAM and at least 120 GB persistent disk. Install CUDA-compatible PyTorch and FFmpeg first. From the reviewed repository checkout run `bash scripts/setup-wan-vast.sh`. This installs the pinned official Wan source and downloads Wan-AI/Wan2.2-TI2V-5B weights. It does not rent a host or create a billable resource. Weight download requires outbound access to Hugging Face.

Start the worker in that Python environment with `bash scripts/start-wan-vast.sh`. Set GPU_API_KEY, WAN_DIR, WAN_CKPT_DIR, OUTPUT_DIR, JOB_DIR and PUBLIC_OUTPUT_BASE_URL. The script listens on localhost; use a stable HTTPS reverse proxy with a valid certificate. Do not expose an unauthenticated inference API. Configure S3-compatible storage on both app and worker, or use Vercel Blob on the app to ingest the worker's completed files.

Preview narration defaults to `TTS_ENGINE=edge` using edge-tts 7.2.8. Arabic default voice is `ar-AE-HamdanNeural`; English is `en-US-GuyNeural`. This calls Microsoft's online Edge speech service without a paid API key. It requires outbound network access and can fail or be rate limited. It does not clone voices. Character voices must use valid Edge IDs, or configure `TTS_GENERATE_COMMAND` for another approved engine. Timeouts remove incomplete audio. Wan generates visual clips only.

Set PUBLIC_OUTPUT_BASE_URL to the HTTPS worker origin (for example https://worker.example), without an /outputs suffix; the worker adds that path itself. Completed files are copied into Vercel Blob by the app when its token is configured, so the saved app media does not depend on keeping the GPU host running.

For Vercel Preview set GPU_PROVIDER=vast, VIDEO_PROVIDER=wan, MAX_SHOT_SECONDS=5, GPU_API_URL and the matching GPU_API_KEY. Configure durable DATABASE_URL and media storage before acceptance testing. These are preview settings; do not change production until live acceptance succeeds.

Do not insert a fake GPU_API_URL just to clear the status badge. It can only be set after the rented host has a verified HTTPS endpoint. A valid HTTP response alone no longer means Wan is ready: the application checks CUDA availability and the worker's Wan installation flags. These flags are file checks, not proof of successful model loading or inference.

TI2V-5B supports landscape 1280×704 and portrait 704×1280. The bridge chooses orientation from the storyboard and quantizes frame count to 4n+1 at 24 fps. The final render normalizes output to the storyboard's display dimensions. Single shots are capped at 10 seconds; longer productions consist of multiple shots.

## Acceptance gates

1. Run TypeScript tests/build and Python tests.
2. Run scripts/gpu-smoke-test.py against the HTTPS worker.
3. With spending approved, generate a short Wan clip and poll to completion.
4. Verify actual MP4 decode, browser playback, seeking and download on the Vercel Preview.
5. Produce an Educational video with narration and a two-episode Series with identity/voice/memory. Verify restart/resume and durable storage.
6. Only then release production.

`npm run test:e2e` uses FAILONCE and expects a simulated failure: it is a fixture acceptance suite, not a real Wan quality test. Never describe its FFmpeg test patterns as model-generated footage.
