FROM python:3.11-slim

# FFmpeg (libass/HarfBuzz/FriBidi for Arabic captions), Node for HyperFrames title cards.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates fontconfig \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# HyperFrames (HeyGen) renders animated Arabic title/end cards; its Chrome is fetched at build time.
RUN npm install -g hyperframes@latest && (hyperframes browser ensure || echo "HyperFrames browser unavailable: cards fall back to FFmpeg")

# Kinocut in its own environment (needs Python >=3.11 and newer deps than the FastAPI pin).
RUN pip install --no-cache-dir uv && UV_TOOL_BIN_DIR=/usr/local/bin uv tool install --python 3.11 "kinocut>=1.16.4"

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p /usr/share/fonts/truetype/cairo && cp assets/fonts/*.ttf /usr/share/fonts/truetype/cairo/ && fc-cache -f
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5)"
CMD ["uvicorn","main:app","--host","0.0.0.0","--port","8000"]
