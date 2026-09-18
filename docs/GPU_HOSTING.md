# GPU hosting

The application needs an external NVIDIA GPU runtime; Vercel hosts the Next.js control plane only.

## Recommended deployment paths

### Runpod
Runpod supports GPU Pods and Serverless workloads, custom containers, network storage and public API endpoints. Deploy the worker Docker image, persist model weights on a volume, expose port 8000, and set:

- GPU_API_URL=https://<worker-host>
- GPU_API_KEY=<shared-secret>

### Modal
Modal supports GPU-backed web functions/servers and persistent volumes. The existing FastAPI worker can be exposed as an ASGI/web service and connected with the same environment variables.

## Required credentials
Cloud GPU provisioning cannot be performed from this repository alone. The operator must connect a Runpod/Modal account (billing + API credentials) or another NVIDIA GPU host. Never commit those credentials to Git.

## Verification gate
Do not label the product as generation-ready until /health reports a reachable GPU worker and a test generation returns a real MP4 output URL.
