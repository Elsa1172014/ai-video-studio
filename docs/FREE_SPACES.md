# Free hosted models (Hugging Face Spaces and other Gradio apps)

Story Studio can make scenes on **free community-hosted video models** instead of your own GPU. The worker is then only a
coordinator (CPU is enough): it sends each scene to a Space, downloads the clip, converts it to MP4, and joins everything to the
exact length you chose.

> **Honest limits.** Quotas, queues, sleeping Spaces, maximum clip length and quality belong to each Space and change often.
> Free accounts get small GPU quotas; a Space may ask you to wait or sign in. This path was built against Gradio's public HTTP
> protocol and **tested against a simulated Space only**: the build environment could not reach Hugging Face, so no real Space
> has been tried yet. Treat the first real run as a test.

## 1. Pick a Space
Open a Space that makes video from text or from an image + text and has a **"Use via API"** link at the bottom of its page.
That panel lists the endpoint (e.g. `/generate`) and the ordered inputs. Check the Space's licence and terms for your use.

## 2. Describe it
Copy `worker/spaces.example.json` to `worker/spaces.json` and fill it from the API panel:

| Field | Meaning |
|---|---|
| `url` | `https://OWNER-SPACENAME.hf.space` (https only) |
| `api_name` | endpoint from the API panel |
| `args` | the Space's inputs **in order**. `"{prompt}"`, `"{duration}"`, `"{seed}"`, `"{image}"` are filled in; every other value is sent as written (e.g. `true`, `512`) |
| `output` | which returned value is the video (0 = first) |
| `max_duration` | longest clip the Space accepts; the scene length is capped to it (a shorter clip holds its last frame so the video keeps your length) |

Use several entries for a fallback chain: if one fails or runs out of quota, the next is tried, and a Space that used up its quota is skipped for 15 minutes.
Image-to-video Spaces (with `"{image}"`) let continuing scenes start from the previous scene's last frame.

Optional: `HF_TOKEN` (a free Hugging Face token) raises quotas. It is only ever sent to `*.hf.space` / `huggingface.co`.

## 3. Run the worker (no GPU needed)
```bash
cd worker && pip install -r requirements.txt   # ffmpeg must be installed
Server for the web app:      uvicorn main:app --port 8000     # then set GPU_API_URL=http://localhost:8000 for the web app
Offline, no server:        python batch.py plan.json --out out    # engine "auto": free Spaces first, then local models
```
`GET /health` lists the Spaces it loaded (`free_spaces`). In `/create` choose **Automatic** or **Free hosted Spaces** as the engine.

## What is tested
`worker/tests/test_hf_space.py` simulates a Gradio server (upload, call, event stream, file download): argument filling, image upload,
fallback chain, quota cool-down, Gradio 4 vs 5 paths, token scoping, refusal to download from unrelated hosts, WebM → H.264 MP4.
`worker/tests/test_storage_render.py` covers joining clips of different sizes and lengths into the exact length.
