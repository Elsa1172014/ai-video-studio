"""Cinematic finishing pipeline.

Turns generated scene clips into a finished film:
normalize -> title/end cards (HyperFrames) -> transitions (Kinocut) -> letterbox
-> colour grade -> vignette -> film grain -> Arabic captions -> fades -> voice/music mix.

Every heavy step uses Kinocut (FFmpeg-based) where it has a command, and plain
FFmpeg otherwise. HyperFrames is optional: without Node/Chrome the cards fall
back to FFmpeg drawtext with HarfBuzz shaping, so Arabic still renders correctly.
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import tempfile
import urllib.request
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, Field

from storage import OUTPUT_DIR

ASSETS = Path(__file__).resolve().parent / "assets"
FONT_REGULAR = ASSETS / "fonts" / "Cairo_400Regular.ttf"
FONT_BOLD = ASSETS / "fonts" / "Cairo_700Bold.ttf"

Transition = Literal["none", "fade", "dissolve", "wipe-left", "wipe-right", "wipe-up", "wipe-down"]
Grade = Literal["none", "warm", "cool", "vintage", "cinematic", "noir"]
Aspect = Literal["16:9", "9:16"]


class Card(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    subtitle: str = Field(default="", max_length=200)
    duration: float = Field(default=3.5, ge=1.5, le=10)


class FinishOptions(BaseModel):
    aspect: Aspect = "16:9"
    transition: Transition = "dissolve"
    transitionDuration: float = Field(default=0.6, ge=0.2, le=2.0)
    grade: Grade = "cinematic"
    vignette: float = Field(default=0.35, ge=0, le=1)
    grain: float = Field(default=0.02, ge=0, le=0.15)
    letterbox: bool = False
    fade: float = Field(default=0.8, ge=0, le=3)
    titleCard: Optional[Card] = None
    endCard: Optional[Card] = None
    captions: Optional[list[str]] = None  # one caption per scene clip, same order
    captionSize: int = Field(default=0, ge=0, le=96)  # 0 = auto
    music: Optional[str] = None  # http(s) URL or worker /outputs URL
    musicVolume: float = Field(default=0.25, ge=0, le=1.5)
    voice: Optional[str] = None  # narration track (http(s) or worker /outputs URL)


# ---------------------------------------------------------------- helpers

def _bin(env: str, name: str) -> str:
    configured = os.getenv(env)
    if configured and Path(configured).exists():
        return configured
    found = shutil.which(name)
    if not found:
        raise RuntimeError(f"{name} was not found. Install it or set {env}.")
    return found


def ffmpeg() -> str:
    try:
        return _bin("FFMPEG_BIN", "ffmpeg")
    except RuntimeError:
        import imageio_ffmpeg  # type: ignore
        return imageio_ffmpeg.get_ffmpeg_exe()


def ffprobe() -> str:
    return _bin("FFPROBE_BIN", "ffprobe")


def kino() -> str:
    return _bin("KINO_BIN", "kino")


async def run(*args: str, cwd: Optional[Path] = None, env: Optional[dict] = None, timeout: int = 1800) -> str:
    proc = await asyncio.create_subprocess_exec(
        *args, cwd=str(cwd) if cwd else None, env=env,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError(f"{Path(args[0]).name} timed out after {timeout}s")
    if proc.returncode:
        detail = (err or out).decode(errors="replace")[-2500:]
        raise RuntimeError(f"{Path(args[0]).name} {args[1] if len(args) > 1 else ''} failed: {detail}")
    return out.decode(errors="replace")


async def k(cmd: str, *args: str) -> None:
    """Run a Kinocut command, always overwriting outputs inside the job folder."""
    await run(kino(), "--overwrite", "--format", "json", cmd, *args)


async def duration(path: Path) -> float:
    out = await run(ffprobe(), "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path))
    return float(json.loads(out)["format"]["duration"])


def size_for(aspect: Aspect) -> tuple[int, int]:
    return (1080, 1920) if aspect == "9:16" else (1920, 1080)


async def fetch_media(value: str, folder: Path, name: str) -> Path:
    """Resolve a worker /outputs URL to the local file, or download an http(s) URL."""
    clean = value.split("?", 1)[0]
    local = (OUTPUT_DIR / clean.rsplit("/", 1)[-1]).resolve()
    if "/outputs/" in clean and local.parent == OUTPUT_DIR.resolve() and local.exists():
        return local
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https"):
        raise RuntimeError(f"Media must be an http(s) URL or a worker output: {value}")
    suffix = Path(parsed.path).suffix.lower() or ".bin"
    target = folder / f"{name}{suffix}"

    def download() -> None:
        req = urllib.request.Request(value, headers={"User-Agent": "AI-Video-Studio/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read(200 * 1024 * 1024 + 1)
            if len(data) > 200 * 1024 * 1024:
                raise RuntimeError("Media file is larger than 200 MB")
            target.write_bytes(data)

    await asyncio.to_thread(download)
    return target


async def normalize(src: Path, dst: Path, w: int, h: int) -> Path:
    """Same fps/size/pixel format/timebase for every clip, so transitions never fail."""
    # Fill the frame (centre crop) — AI clips arrive in 3:2, 4:3 or square and must never show side bars.
    vf = f"fps=30,scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1,format=yuv420p"
    await run(ffmpeg(), "-y", "-v", "error", "-i", str(src), "-vf", vf, "-an",
              "-c:v", "libx264", "-preset", "veryfast", "-crf", "17",
              "-video_track_timescale", "15360", str(dst))
    return dst


# ---------------------------------------------------------------- cards

CARD_HTML = """<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width={w}, height={h}"/>
<script src="gsap.min.js"></script>
<style>
@font-face{{font-family:"Cairo";src:url(Cairo_700Bold.ttf);font-weight:700}}
@font-face{{font-family:"Cairo";src:url(Cairo_400Regular.ttf);font-weight:400}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{w}px;height:{h}px;overflow:hidden;background:#05080c}}
#root{{width:100%;height:100%;font-family:"Cairo";
 background:radial-gradient(ellipse at 50% 42%,#173244 0%,#081219 55%,#030507 100%)}}
#stack{{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
 gap:{gap}px;text-align:center;padding:0 8%}}
#rule{{width:0;height:3px;background:linear-gradient(90deg,transparent,#c9a24a,transparent)}}
#title{{color:#f5e6c8;font-weight:700;font-size:{title_size}px;line-height:1.25}}
#subtitle{{color:#c9a24a;font-weight:400;font-size:{sub_size}px;line-height:1.5}}
</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{dur}" data-width="{w}" data-height="{h}">
 <div id="stack" class="clip" data-start="0" data-duration="{dur}" data-track-index="0">
  <h1 id="title">{title}</h1><div id="rule"></div><p id="subtitle">{subtitle}</p>
 </div>
</div>
<script>
const tl=gsap.timeline({{paused:true}});
tl.fromTo("#root",{{scale:1.06}},{{scale:1,duration:{dur},ease:"none"}},0);
tl.fromTo("#title",{{opacity:0,y:40,filter:"blur(10px)"}},{{opacity:1,y:0,filter:"blur(0px)",duration:1.1,ease:"power3.out"}},0.2);
tl.to("#rule",{{width:"{rule}px",duration:0.9,ease:"power2.out"}},0.7);
tl.fromTo("#subtitle",{{opacity:0,y:20}},{{opacity:1,y:0,duration:0.9,ease:"power2.out"}},1.0);
tl.to("#root",{{opacity:0,duration:0.5,ease:"power1.in"}},{dur}-0.5);
window.__timelines["main"]=tl;tl.seek(0);
</script></body></html>"""


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


async def render_card(card: Card, folder: Path, name: str, w: int, h: int) -> Path:
    out = folder / f"{name}.mp4"
    try:
        return await _card_hyperframes(card, folder / name, out, w, h)
    except Exception as hyper_error:  # fall back to FFmpeg so a missing browser never blocks a film
        try:
            return await _card_ffmpeg(card, out, w, h)
        except Exception as ff_error:
            raise RuntimeError(f"Card render failed (HyperFrames: {hyper_error}) (FFmpeg: {ff_error})")


async def _card_hyperframes(card: Card, project: Path, out: Path, w: int, h: int) -> Path:
    hyper = os.getenv("HYPERFRAMES_BIN") or shutil.which("hyperframes")
    if not hyper:
        raise RuntimeError("hyperframes CLI not installed")
    project.mkdir(parents=True, exist_ok=True)
    for asset in ("gsap.min.js", "fonts/Cairo_700Bold.ttf", "fonts/Cairo_400Regular.ttf"):
        shutil.copy(ASSETS / asset, project / Path(asset).name)
    portrait = h > w
    html = CARD_HTML.format(
        w=w, h=h, dur=card.duration, title=_escape(card.title), subtitle=_escape(card.subtitle),
        title_size=110 if portrait else 120, sub_size=52 if portrait else 54,
        gap=28, rule=int(w * 0.28),
    )
    (project / "index.html").write_text(html, encoding="utf-8")
    (project / "hyperframes.json").write_text(json.dumps({"name": project.name}), encoding="utf-8")
    await run(hyper, "render", "-o", str(out), "--workers", "1", cwd=project, timeout=600)
    if not out.exists():
        raise RuntimeError("HyperFrames finished without output")
    return out


def _drawtext_value(text: str) -> str:
    return text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’").replace("%", "\\%")


async def _card_ffmpeg(card: Card, out: Path, w: int, h: int) -> Path:
    d = card.duration
    title = _drawtext_value(card.title)
    sub = _drawtext_value(card.subtitle)
    fade = f"if(lt(t,0.9),t/0.9,if(gt(t,{d - 0.5}),({d}-t)/0.5,1))"
    vf = [
        f"drawtext=fontfile='{FONT_BOLD}':text='{title}':text_shaping=1:fontsize={int(h * 0.11)}:fontcolor=0xF5E6C8:x=(w-text_w)/2:y=(h-text_h)/2-{int(h * 0.05)}:alpha='{fade}'",
    ]
    if sub:
        vf.append(f"drawtext=fontfile='{FONT_REGULAR}':text='{sub}':text_shaping=1:fontsize={int(h * 0.05)}:fontcolor=0xC9A24A:x=(w-text_w)/2:y=(h/2)+{int(h * 0.08)}:alpha='{fade}'")
    vf.append("vignette=PI/4,format=yuv420p")
    await run(ffmpeg(), "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c=0x0b1a24:s={w}x{h}:r=30:d={d}",
              "-vf", ",".join(vf), "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", str(out))
    return out


# ---------------------------------------------------------------- captions

def _ts(seconds: float) -> str:
    ms = int(round(max(0.0, seconds) * 1000))
    hh, ms = divmod(ms, 3_600_000)
    mm, ms = divmod(ms, 60_000)
    ss, ms = divmod(ms, 1000)
    return f"{hh:02}:{mm:02}:{ss:02},{ms:03}"


def _wrap(text: str, limit: int) -> str:
    words, lines, line = text.split(), [], ""
    for word in words:
        if line and len(line) + 1 + len(word) > limit:
            lines.append(line)
            line = word
        else:
            line = f"{line} {word}".strip()
    if line:
        lines.append(line)
    return "\n".join(lines[:2]) if len(lines) <= 2 else "\n".join([lines[0], " ".join(lines[1:])])


def build_srt(captions: list[Optional[str]], starts: list[float], durations: list[float], td: float, limit: int) -> str:
    blocks, n = [], 0
    for i, text in enumerate(captions):
        if not text or not text.strip():
            continue
        start = starts[i] + (td / 2 if i else 0) + 0.15
        end = starts[i] + durations[i] - (td / 2 if i < len(captions) - 1 else 0) - 0.15
        if end - start < 0.6:
            continue
        n += 1
        blocks.append(f"{n}\n{_ts(start)} --> {_ts(end)}\n{_wrap(text.strip(), limit)}\n")
    return "\n".join(blocks)


def build_ass(srt: str, w: int, h: int, size: int, margin: int) -> str:
    """Authored ASS keeps exact pixel sizing/position; libass shapes Arabic RTL via HarfBuzz/FriBidi."""
    def ass_time(ts: str) -> str:
        hh, mm, rest = ts.split(":")
        ss, ms = rest.split(",")
        return f"{int(hh)}:{mm}:{ss}.{int(ms) // 10:02}"
    events = []
    for block in srt.strip().split("\n\n"):
        lines = block.split("\n")
        if len(lines) < 3:
            continue
        start, end = (part.strip() for part in lines[1].split("-->"))
        # RLM marks anchor punctuation to the right-to-left paragraph (the full stop lands after the last word).
        text = "\\N".join("\u200f" + line.replace("{", "(").replace("}", ")") + "\u200f" for line in lines[2:])
        events.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Caption,,0,0,0,,{text}")
    return "\n".join([
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {w}", f"PlayResY: {h}", "WrapStyle: 2", "ScaledBorderAndShadow: yes", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Caption,Cairo,{size},&H00FFFFFF,&H00FFFFFF,&H90000000,&H64000000,-1,0,0,0,100,100,0,0,1,{max(2, size // 18)},{max(1, size // 30)},2,{int(w * 0.06)},{int(w * 0.06)},{margin},1",
        "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text", *events, "",
    ])


# ---------------------------------------------------------------- pipeline

async def finish(clips: list[Path], opts: FinishOptions, out: Path) -> dict:
    """Run the full cinematic pipeline. Returns a report of the steps applied."""
    w, h = size_for(opts.aspect)
    work = Path(tempfile.mkdtemp(prefix="finish-", dir=str(OUTPUT_DIR)))
    steps: list[str] = []
    warnings: list[str] = []
    try:
        # 1. normalize scene clips
        parts: list[Path] = []
        for i, clip in enumerate(clips):
            parts.append(await normalize(clip, work / f"scene-{i:03}.mp4", w, h))
        steps.append(f"normalize:{len(parts)}")
        captions: list[Optional[str]] = list(opts.captions or [])
        captions = (captions + [None] * len(parts))[: len(parts)]

        # 2. title / end cards
        if opts.titleCard:
            card = await render_card(opts.titleCard, work, "title-card", w, h)
            parts.insert(0, await normalize(card, work / "title-card-n.mp4", w, h))
            captions.insert(0, None)
            steps.append("title-card")
        if opts.endCard:
            card = await render_card(opts.endCard, work, "end-card", w, h)
            parts.append(await normalize(card, work / "end-card-n.mp4", w, h))
            captions.append(None)
            steps.append("end-card")

        durations = [await duration(p) for p in parts]
        td = 0.0 if opts.transition == "none" or len(parts) < 2 else min(opts.transitionDuration, min(durations) / 3)

        # 3. join with transitions
        current = work / "joined.mp4"
        if len(parts) == 1:
            shutil.copy(parts[0], current)
        elif td:
            # FFmpeg's xfade "dissolve" is a random-pixel dissolve (looks like noise); a cinematic
            # dissolve is a crossfade, which xfade calls "fade".
            kind = "fade" if opts.transition in ("fade", "dissolve") else opts.transition
            await k("merge", *map(str, parts), "-t", kind, "-td", f"{td:.2f}", "-o", str(current))
            steps.append(f"transition:{opts.transition}")
        else:
            manifest = work / "concat.txt"
            manifest.write_text("".join(f"file '{p.as_posix()}'\n" for p in parts), encoding="utf-8")
            await run(ffmpeg(), "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(manifest), "-c", "copy", str(current))
        starts, t = [], 0.0
        for d in durations:
            starts.append(t)
            t += d - td

        # 4. letterbox (2.39:1 bars) for landscape films
        if opts.letterbox and w > h:
            bar = int((h - w / 2.39) / 2)
            nxt = work / "letterbox.mp4"
            await run(ffmpeg(), "-y", "-v", "error", "-i", str(current),
                      "-vf", f"drawbox=x=0:y=0:w=iw:h={bar}:color=black:t=fill,drawbox=x=0:y=ih-{bar}:w=iw:h={bar}:color=black:t=fill",
                      "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", str(nxt))
            current = nxt
            steps.append("letterbox")

        # 5. look: grade, vignette, grain
        if opts.grade != "none":
            nxt = work / "graded.mp4"
            await k("color-grade", str(current), "-p", opts.grade, "-o", str(nxt))
            current = nxt
            steps.append(f"grade:{opts.grade}")
        if opts.vignette > 0:
            nxt = work / "vignette.mp4"
            await k("effect-vignette", str(current), "-i", f"{opts.vignette:.2f}", "-o", str(nxt))
            current = nxt
            steps.append("vignette")
        if opts.grain > 0:
            nxt = work / "grain.mp4"
            await k("effect-noise", str(current), "-i", f"{opts.grain:.3f}", "-m", "film", "-o", str(nxt))
            current = nxt
            steps.append("film-grain")

        # 6. Arabic captions (libass + HarfBuzz/FriBidi shape RTL correctly)
        if any(captions):
            srt = build_srt(captions, starts, durations, td, limit=26 if h > w else 42)
            if srt:
                size = opts.captionSize or (round(w * 0.062) if h > w else round(h * 0.054))
                if opts.letterbox and w > h:
                    margin = max(8, (int((h - w / 2.39) / 2) - int(size * 2.5)) // 2)  # centred inside the lower bar
                else:
                    margin = int(h * 0.065)
                ass_path = work / "captions.ass"
                ass_path.write_text(build_ass(srt, w, h, size, margin), encoding="utf-8")
                nxt = work / "captioned.mp4"
                # Burn with FFmpeg's ass filter and the bundled Cairo fonts: exact pixel sizing and
                # full Arabic shaping regardless of which fonts the host OS happens to have.
                fonts = str(FONT_BOLD.parent).replace("\\", "/").replace(":", "\\:")
                ass = str(ass_path).replace("\\", "/").replace(":", "\\:")
                await run(ffmpeg(), "-y", "-v", "error", "-i", str(current), "-vf", f"ass={ass}:fontsdir={fonts}",
                          "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-c:a", "copy", str(nxt))
                current = nxt
                steps.append("captions")
                (out.with_suffix(".srt")).write_text(srt, encoding="utf-8")

        # 7. fade from / to black
        if opts.fade > 0:
            nxt = work / "faded.mp4"
            await k("fade", str(current), "--fade-in", f"{opts.fade:.2f}", "--fade-out", f"{opts.fade:.2f}", "-o", str(nxt))
            current = nxt
            steps.append("fade")

        # 8. sound: narration, music bed, ducking
        if opts.voice:
            voice = await fetch_media(opts.voice, work, "voice")
            nxt = work / "voiced.mp4"
            await k("add-audio", str(current), str(voice), "-v", "1.0", "--duration-policy", "keep_video", "-o", str(nxt))
            current = nxt
            steps.append("voice")
        if opts.music:
            music = await fetch_media(opts.music, work, "music")
            nxt = work / "scored.mp4"
            if opts.voice:
                await k("duck-audio", str(current), str(music), "--music-volume", f"{opts.musicVolume:.2f}", "-o", str(nxt))
                steps.append("music-ducked")
            else:
                await k("add-audio", str(current), str(music), "-v", f"{opts.musicVolume:.2f}",
                        "--fade-in", "1.5", "--fade-out", "2.5", "--duration-policy", "loop_audio", "-o", str(nxt))
                steps.append("music")
            current = nxt

        # 9. delivery encode: web-ready MP4
        audio = ["-c:a", "aac", "-b:a", "192k"] if (opts.voice or opts.music) else ["-an"]
        await run(ffmpeg(), "-y", "-v", "error", "-i", str(current), "-c:v", "libx264", "-preset", "medium",
                  "-crf", "18", "-pix_fmt", "yuv420p", *audio, "-movflags", "+faststart", str(out))
        return {"steps": steps, "warnings": warnings, "duration": round(await duration(out), 2), "size": f"{w}x{h}"}
    finally:
        shutil.rmtree(work, ignore_errors=True)
