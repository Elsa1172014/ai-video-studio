#!/usr/bin/env bash
# Update code only on the already approved Preview worker; preserve models, credentials and tunnel.
set -euo pipefail
test "${CONTAINER_ID:-}" = 55356791
STUDIO_STAGE=${1:?staged code required}
source /workspace/.studio-worker.env
export GPU_API_KEY
/venv/studio/bin/python - <<'PY'
import json,os,pathlib,urllib.request
active=[]
for path in pathlib.Path('/workspace/ai-video-output/jobs').glob('*.json'):
    saved=json.loads(path.read_text())
    if saved.get('status') not in ('queued','processing'):continue
    req=urllib.request.Request('http://127.0.0.1:8000/jobs/'+path.stem,headers={'Authorization':'Bearer '+os.environ['GPU_API_KEY']})
    with urllib.request.urlopen(req,timeout=10) as response:job=json.load(response)
    if job.get('status') in ('queued','processing'):active.append(path.stem)
if active:raise SystemExit('Worker is busy; refusing to interrupt '+str(len(active))+' active job(s).')
print('Worker idle: safe to update.')
PY
uv pip install --python /venv/studio/bin/python --quiet Pillow==11.1.0
/venv/studio/bin/python -m compileall -q "$STUDIO_STAGE/worker"
(cd "$STUDIO_STAGE" && PYTHONPATH=worker /venv/studio/bin/python -m unittest worker/test_duration.py worker/test_motion.py -v)
cp -a "$STUDIO_STAGE/worker/." /workspace/ai-video-studio/worker/
supervisorctl restart studio_worker
/venv/studio/bin/python - <<'PY'
import json,time,urllib.request
for attempt in range(30):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=5) as response:health=json.load(response)
        assert health.get('version')=='0.6.0'
        assert health.get('gpu',{}).get('available') and health.get('wan',{}).get('ready')
        print('Worker 0.6.0: GPU and Wan ready. Existing tunnel unchanged.')
        break
    except Exception:
        if attempt==29:raise
        time.sleep(2)
PY
