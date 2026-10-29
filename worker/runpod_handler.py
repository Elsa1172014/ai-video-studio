import asyncio
import runpod
from adapters import ADAPTERS
from render import RenderRequest, render
from voice import VoiceRequest, synthesize
from capabilities import capabilities


async def handle(payload):
    action = payload.get("action", "generate")
    if action == "generate":
        provider = payload.get("provider", "ltx")
        adapter = ADAPTERS.get(provider)
        if not adapter:
            raise RuntimeError(f"Unknown provider: {provider}")
        return {"status": "completed", "provider": provider,
                "outputUrl": await adapter.generate(payload["prompt"], int(payload.get("duration", 5)), payload.get("imageUrl"))}
    if action == "render":
        return {"status": "completed", **(await render(RenderRequest(clips=payload.get("clips", []), finish=payload.get("finish"))))}
    if action == "voice":
        return {"status": "completed", "outputUrl": await synthesize(VoiceRequest(**{k: payload[k] for k in ("text", "language", "voice") if k in payload}))}
    if action == "health":
        return {"ok": True, "providers": list(ADAPTERS.keys()), "capabilities": capabilities()}
    raise RuntimeError(f"Unknown action: {action}")


def handler(job):
    try:
        return asyncio.run(handle(job.get("input") or {}))
    except Exception as e:
        return {"status": "failed", "message": str(e)}


runpod.serverless.start({"handler": handler})
