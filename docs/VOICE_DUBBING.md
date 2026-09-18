# Voice, avatar and dubbing

The UI supports Arabic-first narration and English. The worker uses a provider command adapter so a licensed TTS engine can be selected without changing the web app. Voice cloning must only be enabled after affirmative consent from the voice owner.

Dubbing target flow: media upload -> Whisper transcription/alignment -> translation -> TTS -> duration alignment -> FFmpeg mux.