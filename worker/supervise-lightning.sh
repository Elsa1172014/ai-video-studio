#!/usr/bin/env bash
set -euo pipefail
ROOT="${STUDIO_ROOT:-/teamspace/studios/this_studio}"
REPO="${REPO_DIR:-$ROOT/ai-video-studio}"
LOG_DIR="${LOG_DIR:-$ROOT/ai-video-logs}"
mkdir -p "$LOG_DIR"
while true; do
 if ! curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
  echo "$(date -Is) worker unavailable; restarting" >> "$LOG_DIR/supervisor.log"
  bash "$REPO/worker/start-lightning.sh" >> "$LOG_DIR/supervisor.log" 2>&1 || true
 fi
 sleep 15
done
