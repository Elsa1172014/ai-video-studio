#!/usr/bin/env bash
set -euo pipefail
ROOT="${STUDIO_ROOT:-/teamspace/studios/this_studio}"
REPO="${REPO_DIR:-$ROOT/ai-video-studio}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT/ai-video-output}"
JOB_DIR="${JOB_DIR:-$OUTPUT_DIR/jobs}"
LTX_DIR="${LTX_DIR:-$ROOT/LTX-Video}"
LOG_DIR="${LOG_DIR:-$ROOT/ai-video-logs}"
PID_FILE="$LOG_DIR/worker.pid"
mkdir -p "$OUTPUT_DIR" "$JOB_DIR" "$LOG_DIR"
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then echo "Worker already running (PID $(cat "$PID_FILE"))."; exit 0; fi
cd "$REPO/worker"
nohup env OUTPUT_DIR="$OUTPUT_DIR" JOB_DIR="$JOB_DIR" LTX_DIR="$LTX_DIR" PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True python -m uvicorn main:app --host 0.0.0.0 --port 8000 >> "$LOG_DIR/worker.log" 2>&1 &
echo $! > "$PID_FILE"
sleep 3
curl -fsS http://127.0.0.1:8000/health
echo
echo "Worker started successfully (PID $(cat "$PID_FILE"))."
