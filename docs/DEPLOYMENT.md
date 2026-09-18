# Deployment

## Web
Deploy the repository as a Next.js application. Set GPU_API_URL to the public HTTPS URL of the GPU worker and GPU_API_KEY to the same secret configured on the worker.

## GPU worker
Use an NVIDIA GPU host with Docker/NVIDIA Container Toolkit. Copy worker/.env.example to worker/.env, set a strong GPU_API_KEY and PUBLIC_OUTPUT_BASE_URL, then configure the official Wan/LTX/TTS/Whisper command adapters installed on that host. Run docker compose up -d --build.

## Required external infrastructure
The repository deliberately does not bundle multi-gigabyte model weights. A GPU host and model weights must exist outside Vercel. Production media should use durable object storage instead of local ephemeral disk.
