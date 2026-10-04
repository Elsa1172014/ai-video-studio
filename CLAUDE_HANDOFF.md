# CLAUDE HANDOFF — AI Video Studio

## Source of truth
Repository: Elsa1172014/ai-video-studio
Working branch: feature/education-series-studios
Open PR: #2 — Add Educational Studio and Series Studio modes
Production URL currently points to the repository's Vercel project. Do not assume main contains the latest two-mode work.

## Product goal
Build a complete AI video-production platform with TWO distinct paths.

### 1. Educational Studio
The user supplies educational text. Preserve its facts and meaning, split it into coherent visual scenes, create narration/visual prompts, generate the clips, and assemble a complete video. Do not hallucinate educational facts.

### 2. Series Studio
The user supplies an episode script or idea. The system creates connected scenes and complete episodes while preserving the SAME characters across scenes and future episodes. Character identity, face, body, wardrobe, voice, relationships and story continuity must persist.

Target episode/video lengths include 1, 3, 5, 10, 15 and 20 minutes. Individual generated shots/scenes are content-driven, currently planned at roughly 10–60 seconds and then assembled.

## Already implemented on this branch
- Education vs Series mode selector.
- Mode-specific script/storyboard planning.
- Variable-length scene planning.
- Character model: name, role, appearance, wardrobe, voice, personality, relationships, referenceImageUrl.
- EpisodeMemory model and series context helper.
- Character Bible fields in Series UI.
- Character reference-image upload.
- Character descriptions injected into scene planning.
- Reference image forwarded into generation; image-conditioned scenes select WAN, text scenes select LTX.
- Full-video generation loop with polling, resumable completed clips, and final render/join.
- RunPod Serverless support plus legacy GPU worker fallback.
- API routes for script, plan, generate, jobs, media, voice, dub, render, video and health.
- GPU worker/adapters and RunPod handler.

## Important current limitation
The Character Bible is partly implemented, but persistence is browser localStorage and episodeMemory is currently sent as an empty array from the home UI. This is NOT yet production-grade cross-device/cross-episode memory.

## Next implementation priorities
1. Persistent project database/storage.
   - Move projects, characters, episode memory and generated asset metadata out of localStorage.
   - Add series -> episodes -> scenes -> assets relationships.
2. True series continuity.
   - Before planning episode N, load previous episodes and canonical Character Bible.
   - Generate/update structured continuity notes after each episode.
   - Never silently mutate locked identity fields.
3. Character locking.
   - Support multiple reference images per character where useful.
   - Pass character references consistently to compatible image/video models.
   - Add explicit locked vs episode-specific wardrobe/appearance state.
4. Voice locking.
   - Assign persistent voice IDs/settings to characters.
   - Route dialogue by character and preserve voice across episodes.
5. Dialogue/audio pipeline.
   - Produce per-scene narration/dialogue audio, lipsync/avatar only when required, mix audio, then final render.
6. Storage.
   - Generated MP4/image/audio files need durable public/object storage. RunPod local paths are not sufficient for browser playback.
7. Production jobs.
   - Persist job state server-side, retry failed scenes, resume safely, expose progress and useful errors.
8. Final render.
   - Respect scene order, audio, transitions and target duration; export a stable downloadable MP4.
9. UX.
   - Project/series dashboard, Character Library, episode history, editable storyboard, regenerate-one-scene, continuity warnings.
10. Tests and deployment verification.
   - Typecheck/build, API tests, one Educational end-to-end test and one multi-scene Series test.
   - Verify Vercel preview before production.

## Architecture snapshot
Frontend: Next.js / TypeScript.
Web/API: app/ and app/api/*.
Client project model: lib/project-store.ts.
Provider orchestration: lib/generation.ts.
Full production UI: components/FullVideoGenerator.tsx.
GPU worker: worker/.
GPU adapters: worker/adapters/.
Deployment: Vercel frontend/API + RunPod/legacy GPU worker.

## Environment variables
Vercel/app:
- RUNPOD_ENDPOINT_ID
- RUNPOD_API_KEY
- GPU_API_URL (legacy fallback)
- GPU_API_KEY (legacy fallback)

Worker:
- GPU_API_KEY
- PUBLIC_OUTPUT_BASE_URL
- OUTPUT_DIR
- JOB_DIR
- LTX_DIR
- LTX_PIPELINE_CONFIG
- WAN_GENERATE_COMMAND

Never commit real API keys.

## Collaboration rules for Claude
- Work from feature/education-series-studios unless/until PR #2 is intentionally merged.
- Read the existing implementation before replacing it.
- Preserve both Education and Series paths.
- Do not revert working RunPod/worker integrations.
- Keep commits small and descriptive.
- For each change, report files changed, behavior changed, tests/build result, and remaining blocker.
- Do not claim video generation is complete unless an actual end-to-end generated clip and final assembled video have been verified.
- Coordinate through GitHub commits/PR history so another agent can continue from the same source of truth.

## Definition of done
A user can create an Educational project from supplied text and receive a complete assembled video. A user can create a Series, define/import characters, produce episode 1, then produce episode 2 with recognizably persistent character identity and voice plus story continuity. Interrupted generation can resume. Assets survive worker restarts. Projects survive browser/device changes. Deployment is verified end-to-end.
