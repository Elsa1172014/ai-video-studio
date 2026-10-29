# Cinematic finish

The final render no longer just concatenates clips. When the browser sends `finish` options with
`POST /api/render`, the worker runs `worker/finish.py`:

| Step | Tool | Notes |
|---|---|---|
| Normalise clips | FFmpeg | 30 fps, target size, yuv420p, shared timebase — transitions never fail on mixed sources |
| Title / closing cards | **HyperFrames** (HeyGen) | Animated Arabic cards (Cairo font, GSAP). Falls back to FFmpeg `drawtext` with HarfBuzz shaping if no browser |
| Transitions | **Kinocut** `merge` | fade, dissolve, wipe-left/right/up/down |
| Letterbox | FFmpeg | 2.39:1 bars for landscape |
| Colour grade | **Kinocut** `color-grade` | cinematic, warm, cool, vintage, noir |
| Vignette, film grain | **Kinocut** `effect-vignette`, `effect-noise` | |
| Arabic captions | FFmpeg `ass` + libass | Authored ASS in pixel units, bundled Cairo fonts, RTL marks so punctuation lands correctly. Timed from real clip lengths minus transition overlaps. `.srt` sidecar is published next to the MP4 |
| Fades | **Kinocut** `fade` | |
| Sound | **Kinocut** `add-audio`, `duck-audio` | Narration track, music bed (looped), music ducks under voice |
| Delivery | FFmpeg | H.264 CRF 18, AAC 192k, `+faststart` |

## Presets (UI)

Cinematic film · Documentary · Classroom clear · Reels/Shorts (9:16) · Noir · Raw join.
Every value is editable under "fine controls". Settings are saved per project, and
**Re-apply cinematic finish** re-renders the film with a new look without regenerating any scene.

## Payload

```json
{
  "clips": ["https://worker/outputs/a.mp4", "https://worker/outputs/b.mp4"],
  "finish": {
    "aspect": "16:9", "transition": "dissolve", "transitionDuration": 0.7,
    "grade": "cinematic", "vignette": 0.35, "grain": 0.02, "letterbox": true, "fade": 0.8,
    "titleCard": {"title": "رفيق العربية الذكي", "subtitle": "قسم اللغة العربية", "duration": 3.5},
    "endCard": {"title": "ابدأ الآن", "subtitle": "", "duration": 3},
    "captions": ["نص المشهد الأول", null],
    "music": "https://…/score.mp3", "musicVolume": 0.25,
    "voice": "https://…/voiceover.wav"
  }
}
```

`/render` on the HTTP worker is now a job (`{jobId, status:"queued"}`); poll `/jobs/{jobId}`.
The completed job carries `outputUrl`, `captionsUrl` and a `report` of the steps applied.

## Installing the tools on a worker host

```bash
sudo apt-get install -y ffmpeg                       # needs libass + harfbuzz + fribidi (Ubuntu/Debian builds have them)
uv tool install --python 3.11 kinocut                # isolated: Kinocut needs Python >= 3.11 and newer deps than the FastAPI pin
npm install -g hyperframes && hyperframes browser ensure   # optional: animated title cards
```

Both Dockerfiles already do this. Override binaries with `KINO_BIN`, `HYPERFRAMES_BIN`,
`FFMPEG_BIN`, `FFPROBE_BIN`. `GET /health` reports which tools the worker found.
