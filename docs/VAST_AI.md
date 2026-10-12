# Vast.ai deployment

Vast.ai runs plain Docker containers, so it uses the **legacy HTTP worker** path (`GPU_API_URL`), not Runpod Serverless. Leave `RUNPOD_ENDPOINT_ID` / `RUNPOD_API_KEY` unset in Vercel, otherwise the app prefers Runpod.

## 1. Image
Pushing to `main` (paths under `worker/`) builds `ghcr.io/<owner>/ai-video-studio-vast:latest` via `.github/workflows/vast-image.yml`. Make the package public in GitHub (Packages → Package settings), or add registry credentials in Vast.

## 2. Pick the machine
LTX-Video (2B distilled, the default config) needs roughly 16–24 GB of **VRAM**. Choose an RTX 4090 / A5000 / A6000 class GPU with ≥ 60 GB disk. System RAM is not the constraint: do not filter by very large RAM (`offerRamMin` in a search URL only narrows the offers and raises the price).

## 3. Create the instance
- Template: custom Docker image `ghcr.io/<owner>/ai-video-studio-vast:latest`, launch mode "Docker entrypoint" (the image starts uvicorn itself).
- Docker options: `-p 8000:8000`
- Environment variables:
  - `GPU_API_KEY=<long random secret>`
  - `PUBLIC_OUTPUT_BASE_URL=http://<instance-ip>:<mapped-port>` (Vast shows the mapped external port for 8000)
- Disk: ≥ 60 GB. First generation downloads the LTX weights from Hugging Face; later runs reuse them while the instance exists.

## 4. Connect Vercel
Set in Vercel project environment variables, then redeploy:

```
GPU_API_URL=http://<instance-ip>:<mapped-port>
GPU_API_KEY=<same secret>
```

All calls to the worker are server-side (API routes), and the browser plays video through `/api/video/<file>`, so plain HTTP to the instance works. Prefer a Cloudflare quick tunnel (`cloudflared tunnel --url http://localhost:8000`) if you want HTTPS.

## 5. Verify (do this before calling it ready)
1. `curl -H "Authorization: Bearer $GPU_API_KEY" http://<ip>:<port>/health` → `ok: true` and `gpu.available: true`.
2. Open the app: the header badge shows "GPU connected".
3. Generate one 5 s scene; confirm a playable MP4.

## Notes
- Stop or destroy the instance when idle: Vast bills while it exists. Outputs live on the instance disk and are lost when it is destroyed; download finished videos first.
- Vast instance IPs/ports change on every new instance; update `GPU_API_URL` and `PUBLIC_OUTPUT_BASE_URL` each time.
