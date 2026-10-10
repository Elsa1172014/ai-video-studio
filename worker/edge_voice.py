"""Keyless Edge TTS for preview narration; text is sent to Microsoft's service."""
import asyncio
import os
import re
from pathlib import Path

DEFAULTS = {"ar": "ar-AE-HamdanNeural", "en": "en-US-GuyNeural"}

def voice_name(language, voice):
    if voice in ("", "default"):
        return DEFAULTS.get(language.split('-')[0], DEFAULTS['ar'])
    if not re.fullmatch(r'[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural', voice):
        raise RuntimeError('Use an Edge voice ID such as ar-AE-HamdanNeural')
    return voice

async def generate(text, language, voice, output):
    import edge_tts
    output = Path(output)
    try:
        await asyncio.wait_for(
            edge_tts.Communicate(text, voice_name(language, voice)).save(str(output)),
            timeout=int(os.getenv('TTS_TIMEOUT_SECONDS', '120')),
        )
        if not output.is_file() or output.stat().st_size == 0:
            raise RuntimeError('TTS service returned no audio')
    except BaseException:
        output.unlink(missing_ok=True)
        raise
