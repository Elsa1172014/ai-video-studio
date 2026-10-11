# AI Video Studio

Open-source-first AI video creation studio. Initial architecture supports script-to-scenes, long-video planning, avatar/talking-photo, voice, dubbing and render orchestration. Heavy GPU providers are adapters so Wan/LTX/LivePortrait/MuseTalk/TTS backends can be connected without changing the UI.


## Studios

- **Educational Studio**: paste a lesson; the director keeps every sentence verbatim as narration and plans 10-60 s visual teaching scenes.
- **Series Studio**: a server-side Character Bible (locked identity, reference image, voice) and structured episode memory that is loaded automatically into every following episode.

Projects, characters, episodes, generation jobs and final videos are stored on the server (PostgreSQL + Vercel Blob or S3-compatible storage). See [docs/PLATFORM.md](docs/PLATFORM.md) and `.env.example` for configuration.

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck && npm test && npm run build
```
