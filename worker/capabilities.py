"""Report which finishing tools are installed on this worker."""
import os
import shutil


def _has(env: str, name: str) -> bool:
    configured = os.getenv(env)
    return bool((configured and os.path.exists(configured)) or shutil.which(name))


def capabilities() -> dict:
    return {
        "ffmpeg": _has("FFMPEG_BIN", "ffmpeg"),
        "kinocut": _has("KINO_BIN", "kino"),
        "hyperframes": _has("HYPERFRAMES_BIN", "hyperframes"),
        "tts": bool(os.getenv("TTS_GENERATE_COMMAND")),
        "whisper": bool(os.getenv("WHISPER_COMMAND")),
        "finishing": _has("KINO_BIN", "kino") and _has("FFMPEG_BIN", "ffmpeg"),
    }
