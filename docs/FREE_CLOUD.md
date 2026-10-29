# Free cloud pipeline (no server)

Run the whole studio without a GPU server or a paid plan:

| Stage | Runs on | Free allowance |
|---|---|---|
| Scene generation | Hugging Face **ZeroGPU** Spaces (LTX-2.3, LTX-2.5, LTX-2 Turbo, Wan 2.2), called from GitHub Actions | 2 GPU-min/day anonymous, 5 GPU-min/day with a free `HF_TOKEN` |
| Cinematic finish | **GitHub Actions** (`.github/workflows/studio-cloud.yml`) with Kinocut, HyperFrames, FFmpeg/libass | Unlimited minutes for public repositories |
| Web app | Vercel Hobby | Free |

Each scene and the final film is one workflow run. Results are published as assets of the
repository's `films` release (pruned after 14 days) and streamed through `/api/video/:file`.

## Setup (≈5 minutes)

1. **Merge** this branch so `studio-cloud.yml` is on the default branch (GitHub only dispatches workflows from there).
2. **GitHub token** — github.com → Settings → Developer settings → Fine-grained tokens → *Generate*:
   repository access = this repo only; permissions **Actions: Read and write**, **Contents: Read**.
3. **Vercel** → Project → Settings → Environment Variables:
   `GITHUB_CLOUD_REPO=Elsa1172014/ai-video-studio`, `GITHUB_CLOUD_TOKEN=<token>` → redeploy.
4. *(Recommended)* **Hugging Face token** — huggingface.co → Settings → Access Tokens → *Read*.
   Add it in GitHub → repo → Settings → Secrets and variables → Actions → **New repository secret** `HF_TOKEN`.
   This raises the free GPU quota from 2 to 5 minutes a day.
5. *(Optional)* Repository variable `HF_VIDEO_SPACES` to choose/order Spaces, e.g. `Lightricks/LTX-2-3,alexnasa/ltx-2-TURBO`.

## Limits to expect

- A scene is capped at 10 s per generation; one short scene costs roughly 30–60 s of GPU quota.
  The free quota suits testing (a few scenes a day), not full-length lessons.
- Each run waits for a free GitHub runner (usually < 1 min); finishing a 1-minute film takes 2–4 min.
- Public Spaces belong to their authors and can go down. The task tries the configured list, then
  searches the Hub for running ZeroGPU video Spaces automatically. The result file lists skipped Spaces.
- Narration (TTS) and uploads need a worker; on the free cloud, paste public links instead.
- Release assets are public: do not render confidential material on the free cloud.
