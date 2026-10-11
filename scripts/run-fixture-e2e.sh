#!/usr/bin/env bash
# Local acceptance only: generated footage/audio are FFmpeg fixtures, not Wan.
set -euo pipefail
STUDIO_TASK_ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$STUDIO_TASK_ROOT"
python -c 'import uvicorn, fastapi'
STUDIO_TASK_DATA=$(mktemp -d /tmp/studio-fixture-e2e-XXXXXX)
export OUTPUT_DIR="$STUDIO_TASK_DATA/output" JOB_DIR="$STUDIO_TASK_DATA/jobs" DATA_DIR="$STUDIO_TASK_DATA/data"
export GPU_API_KEY=fixture-key GPU_API_URL=http://127.0.0.1:8003 GPU_PROVIDER=vast VIDEO_PROVIDER=wan MAX_SHOT_SECONDS=5
export PUBLIC_OUTPUT_BASE_URL=http://127.0.0.1:8003
export WAN_GENERATE_COMMAND="bash $STUDIO_TASK_ROOT/scripts/stubs/fake-video.sh"
export LTX_GENERATE_COMMAND="$WAN_GENERATE_COMMAND"
export TTS_GENERATE_COMMAND="bash $STUDIO_TASK_ROOT/scripts/stubs/fake-tts.sh"
unset DATABASE_URL BLOB_READ_WRITE_TOKEN S3_BUCKET STUDIO_PASSWORD
python -m uvicorn main:app --app-dir worker --host 127.0.0.1 --port 8003 > "$STUDIO_TASK_DATA/worker.log" 2>&1 &
STUDIO_WORKER_PID=$!
npm run dev -- --hostname 127.0.0.1 --port 3003 > "$STUDIO_TASK_DATA/web.log" 2>&1 &
STUDIO_WEB_PID=$!
trap 'kill "$STUDIO_WORKER_PID" "$STUDIO_WEB_PID" 2>/dev/null || true' EXIT
export STUDIO_TASK_DATA
python - <<'PY'
import os,time,urllib.request
from pathlib import Path
for url in ['http://127.0.0.1:8003/health','http://127.0.0.1:3003/api/providers']:
 for i in range(60):
  try: urllib.request.urlopen(url,timeout=2).read(); break
  except Exception: time.sleep(.5)
 else:
  root=Path(os.environ['STUDIO_TASK_DATA'])
  for name in ['worker.log','web.log']: print((root/name).read_text()[-3000:])
  raise RuntimeError('Local service did not start: '+url)
PY
BASE_URL=http://127.0.0.1:3003 node scripts/e2e.mjs
printf 'Fixture evidence: %s\n' "$STUDIO_TASK_DATA"
