# AI Video Studio

Open-source-first AI video creation studio. Initial architecture supports script-to-scenes, long-video planning, avatar/talking-photo, voice, dubbing and render orchestration. Heavy GPU providers are adapters so Wan/LTX/LivePortrait/MuseTalk/TTS backends can be connected without changing the UI.

## Tests

```bash
npm test                         # web: API routes, GPU provider client, project store (Vitest)
cd worker && pip install -r requirements-dev.txt && python -m pytest   # worker: job API, storage, FFmpeg render (needs ffmpeg)
```

CI (`.github/workflows/ci.yml`) runs typecheck, both suites and the production build on every push and pull request.
