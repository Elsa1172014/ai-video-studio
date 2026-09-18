# GPU Provider Contract

The web app is provider-neutral. Configure GPU_API_URL and optionally GPU_API_KEY.

POST /generate

Request: { provider, prompt, duration, imageUrl? }

Response: { jobId, status, provider, outputUrl? }

GET /jobs/:id returns the same job shape. This contract allows Wan 2.2, LTX Video, or another GPU worker to be attached without changing the UI.

Next worker target: Python/FastAPI queue service with a Wan/LTX adapter, object storage, and asynchronous job status.