"""Serverless tasks for the free cloud pipeline (run inside GitHub Actions).

    python cloud_task.py generate --request request.json --out scene.mp4
    python cloud_task.py finish   --request request.json --out film.mp4
    python cloud_task.py discover

`generate` calls a Hugging Face ZeroGPU Space through gradio_client (free daily GPU quota).
`finish`   downloads scene clips and runs the cinematic pipeline in finish.py.
Both write <out>.json with the result so the web app can read it.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_SPACES = [s.strip() for s in os.getenv(
    "HF_VIDEO_SPACES",
    "Lightricks/ltx-2-distilled,Lightricks/ltx-2,Lightricks/ltx-video-distilled,zerogpu-aoti/wan2-2-fp8da-aoti-faster",
).split(",") if s.strip()]

PROMPT_KEYS = ("prompt", "text", "caption", "description")
DURATION_KEYS = ("duration", "seconds", "length", "video_length", "duration_seconds")
SKIP_KEYS = ("negative",)


def log(message: str) -> None:
    print(f"[cloud] {message}", flush=True)


# ---------------------------------------------------------------- generate

def _endpoints(client) -> dict[str, list[dict]]:
    info = client.view_api(print_info=False, return_format="dict") or {}
    return {name: spec.get("parameters", []) for name, spec in (info.get("named_endpoints") or {}).items()}


def _pick_endpoint(endpoints: dict[str, list[dict]]) -> str:
    preferred = os.getenv("HF_VIDEO_ENDPOINT")
    if preferred and preferred in endpoints:
        return preferred
    scored = []
    for name, params in endpoints.items():
        names = " ".join((p.get("parameter_name") or p.get("label") or "").lower() for p in params)
        score = ("video" in name) * 3 + ("generate" in name) * 2 + ("prompt" in names) * 4 + ("t2v" in name or "text" in name)
        if "prompt" in names:
            scored.append((score, name))
    if not scored:
        raise RuntimeError(f"No text-to-video endpoint found. Endpoints: {list(endpoints)}")
    return sorted(scored, reverse=True)[0][1]


def _build_kwargs(params: list[dict], prompt: str, duration: float) -> dict[str, Any]:
    kwargs: dict[str, Any] = {}
    prompt_set = False
    for p in params:
        name = p.get("parameter_name")
        if not name:
            continue
        lname = name.lower()
        if not prompt_set and any(k in lname for k in PROMPT_KEYS) and not any(k in lname for k in SKIP_KEYS):
            kwargs[name] = prompt
            prompt_set = True
        elif any(k == lname or lname.startswith(k) for k in DURATION_KEYS):
            kwargs[name] = duration
        elif "randomize" in lname and "seed" in lname:
            kwargs[name] = True
        elif "image" in lname and not p.get("parameter_has_default"):
            kwargs[name] = None
        elif p.get("parameter_has_default"):
            kwargs[name] = p.get("parameter_default")
        else:
            kwargs[name] = None
    if not prompt_set:
        raise RuntimeError("Could not map the prompt to this Space's inputs")
    return kwargs


def _find_video(value: Any) -> str | None:
    if isinstance(value, str) and value.lower().split("?")[0].endswith((".mp4", ".webm", ".mov")) and os.path.exists(value):
        return value
    if isinstance(value, dict):
        for key in ("video", "path", "value", "name"):
            if key in value:
                found = _find_video(value[key])
                if found:
                    return found
        for item in value.values():
            found = _find_video(item)
            if found:
                return found
    if isinstance(value, (list, tuple)):
        for item in value:
            found = _find_video(item)
            if found:
                return found
    return None


def generate(request: dict, out: Path) -> dict:
    from gradio_client import Client

    prompt = str(request["prompt"])[:2000]
    duration = float(max(1, min(10, request.get("duration", 5))))
    token = os.getenv("HF_TOKEN") or None
    spaces = [request["space"]] if request.get("space") else DEFAULT_SPACES
    errors = []
    for space in spaces:
        try:
            log(f"connecting to {space}")
            client = Client(space, token=token, verbose=False, download_files=str(out.parent / "hf-downloads"))
            endpoints = _endpoints(client)
            endpoint = _pick_endpoint(endpoints)
            kwargs = _build_kwargs(endpoints[endpoint], prompt, duration)
            log(f"calling {endpoint} with {sorted(kwargs)}")
            started = time.time()
            result = client.predict(api_name=endpoint, **kwargs)
            video = _find_video(result)
            if not video:
                raise RuntimeError(f"Space returned no video: {str(result)[:300]}")
            shutil.move(video, out)
            log(f"video ready from {space} in {time.time() - started:.0f}s")
            return {"status": "completed", "provider": "hf", "space": space, "endpoint": endpoint, "seconds": round(time.time() - started)}
        except Exception as e:  # try the next Space
            message = str(e)
            log(f"{space} failed: {message[:400]}")
            errors.append(f"{space}: {message[:300]}")
            if "quota" in message.lower() or "exceeded" in message.lower():
                break  # the quota is per account; other Spaces will refuse too
    raise RuntimeError("All video Spaces failed. " + " | ".join(errors))


# ---------------------------------------------------------------- finish

def _download(url: str, target: Path) -> Path:
    req = urllib.request.Request(url, headers={"User-Agent": "AI-Video-Studio/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r, target.open("wb") as f:
        shutil.copyfileobj(r, f)
    if target.stat().st_size < 1024:
        raise RuntimeError(f"Downloaded file is too small: {url}")
    return target


def finish(request: dict, out: Path) -> dict:
    os.environ.setdefault("OUTPUT_DIR", str(out.parent / "work"))
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from finish import FinishOptions, finish as run_finish  # noqa: E402
    from render import _concat  # noqa: E402

    work = Path(os.environ["OUTPUT_DIR"])
    work.mkdir(parents=True, exist_ok=True)
    clips = []
    for i, url in enumerate(request.get("clips") or []):
        log(f"downloading clip {i + 1}")
        clips.append(_download(url, work / f"clip-{i:03}.mp4"))
    if not clips:
        raise RuntimeError("No clips supplied")
    opts = request.get("finish")
    if opts:
        report = asyncio.run(run_finish(clips, FinishOptions(**opts), out))
        return {"status": "completed", "report": report, "captions": out.with_suffix(".srt").exists()}
    asyncio.run(_concat(clips, out))
    return {"status": "completed", "captions": False}


# ---------------------------------------------------------------- discover

def discover() -> dict:
    """Report which candidate Spaces are running and what their endpoints accept."""
    from gradio_client import Client
    found = []
    for space in DEFAULT_SPACES:
        try:
            client = Client(space, token=os.getenv("HF_TOKEN") or None, verbose=False)
            endpoints = _endpoints(client)
            found.append({"space": space, "ok": True, "endpoint": _pick_endpoint(endpoints),
                          "params": {k: [p.get("parameter_name") for p in v] for k, v in endpoints.items()}})
        except Exception as e:
            found.append({"space": space, "ok": False, "error": str(e)[:300]})
    return {"status": "completed", "spaces": found}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("task", choices=["generate", "finish", "discover"])
    parser.add_argument("--request", type=Path)
    parser.add_argument("--out", type=Path, default=Path("out.mp4"))
    args = parser.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    result_path = args.out.with_suffix(".json")
    try:
        request = json.loads(args.request.read_text(encoding="utf-8")) if args.request else {}
        result = {"generate": generate, "finish": finish}[args.task](request, args.out) if args.task != "discover" else discover()
        code = 0
    except Exception as e:
        result, code = {"status": "failed", "message": str(e)[:3000]}, 1
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    log(json.dumps(result, ensure_ascii=False)[:2000])
    return code


if __name__ == "__main__":
    raise SystemExit(main())
