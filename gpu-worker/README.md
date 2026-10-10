# Vast.ai GPU worker (safe scaffold)

This worker provides a validated, bearer-authenticated API skeleton. **It does not generate videos yet.** `/generate` and `/render` return 503 until a licensed, tested inference backend is integrated. Do not rent a GPU expecting generation to work from this scaffold alone.

Run locally:

```sh
cd gpu-worker
python -m pip install -r requirements.txt
GPU_API_KEY=replace-with-random-secret uvicorn app:app --host 127.0.0.1 --port 8000
```

`GET /health` reports `inference_enabled: false`. Protected routes require `Authorization: Bearer <GPU_API_KEY>`.

Before production: implement asynchronous job queue and persistent database, Wan 2.2 model loader, object storage upload, GPU/VRAM checks, request limits, private TLS ingress, monitoring, and end-to-end tests. Do not expose port 8000 publicly without HTTPS and authentication. `VAST_API_KEY` is for provisioning only and must **never** be given to the worker or exposed to clients.
