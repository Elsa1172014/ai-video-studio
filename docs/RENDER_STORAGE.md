# Media storage and render

Uploads flow through /api/media to the GPU/media service. The local worker stores development assets under OUTPUT_DIR and exposes them through /outputs. Production should replace local disk with durable object storage.

Final rendering uses FFmpeg. A render manifest combines generated clips; audio, subtitle burn-in, transitions and normalization can be added in the render adapter. Whisper/WhisperX is isolated behind WHISPER_COMMAND for transcription/alignment.