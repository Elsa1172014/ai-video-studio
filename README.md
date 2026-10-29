# AI Video Studio

Open-source-first AI video creation studio. Script-to-scenes, long-video planning, avatar/talking-photo, voice, dubbing and render orchestration. Heavy GPU providers are adapters so Wan/LTX/LivePortrait/MuseTalk/TTS backends can be connected without changing the UI.

## Cinematic finish

Generated scenes are finished into a film on the worker with **Kinocut** (transitions, colour grade, vignette, film grain, fades, music ducking), **HyperFrames** by HeyGen (animated Arabic title and closing cards) and FFmpeg/libass (Arabic captions with correct right-to-left shaping). Pick a preset — Cinematic film, Documentary, Classroom clear, Reels/Shorts, Noir — and re-apply a new look at any time without regenerating scenes. See [docs/CINEMATIC_FINISH.md](docs/CINEMATIC_FINISH.md).

## Configuration (web)

| Variable | Purpose |
|---|---|
| `RUNPOD_ENDPOINT_ID`, `RUNPOD_API_KEY` | Runpod Serverless worker (preferred) |
| `PUBLIC_OUTPUT_BASE_URL` | Where Runpod outputs are publicly served, so the app can stream them |
| `GPU_API_URL`, `GPU_API_KEY` | HTTP worker (also enables uploads) |

## API

`POST /api/script` (alias `/api/plan`) · `POST /api/generate` · `GET /api/jobs/:id` · `POST /api/render` (with optional `finish`) · `POST /api/voice` · `POST /api/media` · `GET /api/providers` · `GET /api/health` · `GET /api/video/:file`
