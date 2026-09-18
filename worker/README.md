# GPU Worker

This is the deployable inference gateway for AI Video Studio. It exposes /health, POST /generate, and GET /jobs/:id. The HTTP contract is already connected to the Next.js application.

## Run

cd worker
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000

Set GPU_API_KEY on the worker. In the web application set GPU_API_URL to the worker URL and GPU_API_KEY to the same secret.

## Model integration

The worker intentionally keeps model runtime behind an adapter boundary. Wan 2.2/LTX model weights are large and must be installed on a compatible GPU host. Do not place model weights in this Git repository.
