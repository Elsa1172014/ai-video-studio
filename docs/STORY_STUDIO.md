# Story Studio (`/create`)

Text or story in → a video of exactly the length you choose, scene by scene.

## Flow
1. **Write**: paste the story and set the length in minutes, seconds or total seconds (up to 30 min). Typing 90 seconds reads 1:30.
2. **Cast**: the studio detects characters, setting, mood and the story's moral (Arabic and English; rule-based, optionally refined by your own language model, see below). Edit anything; add a reference image URL per character.
3. **Storyboard**: scenes of 3–10 s whose durations add up to **exactly** the chosen length. Scenes that continue the same beat start from the previous scene's last frame; a new beat is a cut anchored to the character reference.
4. **Produce**: the Reel shows one arc per scene (coloured by its real status), overall progress and ETA. Stop and resume at any time; finished scenes survive a reload.

## Exact length
Models return "about" the requested length. The worker's `/render` trims every clip to its planned duration (`durations`) and cuts the final video at their sum, so the result is the length you chose (verified end to end: 60.00 s for 60 s).

## Progress is honest
The ring reports **seconds of video actually produced** (95%) plus the join step (5%). There is no fake in-between animation: a generating scene is shown as active, not as a made-up percentage.

## Optional story model (free, self-hosted)
Set `STORY_LLM_URL` (any OpenAI-compatible endpoint, e.g. Ollama `http://host:11434/v1`), optional `STORY_LLM_MODEL` and `STORY_LLM_KEY`. Characters the model invents that are not in the story are dropped; any failure falls back to the rule-based analysis. Nothing is sent anywhere unless the variable is set.

## Not in this phase
Talking avatar, narration/voice and captions (phases 3–4). Character consistency uses reference images, last-frame chaining and a locked description; open models keep faces approximately, not perfectly.

## Tests
- `npm test`: planner, story analysis, runner (retries, resume, stop), progress maths, API.
- `cd worker && python -m pytest`: job queue, exact-length render, last frame, references (real FFmpeg).
- `npm run build && PYTHON=<venv python> node e2e/story-studio.mjs`: real Chromium against the real worker with a **stand-in for the video model** (`e2e/fake_gpu.py` writes FFmpeg test patterns). It checks exact length, ring progress, chaining and mobile layout. It does not prove AI generation; that needs a GPU (see `docs/VAST_AI.md`).
