# Runpod Serverless deployment

AI Video Studio supports Runpod Serverless as an alternative GPU backend.

## Recommended worker
- GPU: A100 80 GB
- Flex workers: scale to zero when idle
- Network volume mounted at /runpod-volume for persistent outputs/model cache
- Container: build worker/Dockerfile.runpod from this repository

## Required Vercel variables
- GPU_PROVIDER=runpod
- RUNPOD_ENDPOINT_ID=<endpoint id>
- RUNPOD_API_KEY=<secret>

Do not commit API keys.

The frontend remains on Vercel. Runpod receives generation jobs through its Serverless API. Completed scene URLs should ultimately be copied to durable object storage; the current migration keeps the existing backend available until the Runpod endpoint is configured and verified.
