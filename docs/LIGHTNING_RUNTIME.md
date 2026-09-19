# Lightning Studio runtime

LTX and the FastAPI worker remain unchanged. The goal here is process persistence and stable ingress.

## Start the worker detached

```bash
chmod +x worker/start-lightning.sh worker/supervise-lightning.sh
./worker/start-lightning.sh
nohup ./worker/supervise-lightning.sh > /teamspace/studios/this_studio/ai-video-logs/supervisor.out 2>&1 &
curl http://127.0.0.1:8000/health
```

Persistent paths default to `/teamspace/studios/this_studio/ai-video-output`, its `jobs` subdirectory, and `/teamspace/studios/this_studio/ai-video-logs`.

Closing a terminal will not stop these nohup processes. It cannot prevent a full Lightning Studio suspension.

## Public ingress

Set Vercel `GPU_API_URL` to a stable HTTPS tunnel base, never Lightning's browser `web-ui?port=8000` URL. Keep `GPU_API_KEY` server-side and identical in Lightning and Vercel.

A Cloudflare Named Tunnel provides a stable hostname but publishing an application requires a domain on Cloudflare. An ngrok assigned development domain is an alternative when available on the account.

Generated MP4s currently use the worker `/outputs` route. Production should later move completed media to object storage so playback does not depend on Studio uptime.
