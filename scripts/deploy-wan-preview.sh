#!/usr/bin/env bash
# Authenticated Preview API on the existing approved instance only.
set -euo pipefail
test "${CONTAINER_ID:-}" = 55356791
test -f /workspace/wan-preview-provisioned
STUDIO_REPO=$(cd "$(dirname "$0")/.." && pwd)
source /venv/studio/bin/activate
python - "$STUDIO_REPO" <<'PY'
import base64, os, pathlib, shlex, sys
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
root=pathlib.Path(sys.argv[1])
private=serialization.load_pem_private_key(pathlib.Path('/workspace/studio-credential-transport.pem').read_bytes(),password=None)
key=private.decrypt(base64.b64decode((root/'.github/vast-preview-api-key.enc').read_text()),padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),algorithm=hashes.SHA256(),label=None)).decode()
assert len(key)==64 and '\n' not in key
path=pathlib.Path('/workspace/.studio-worker.env')
fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,'w') as f:
    f.write('export GPU_API_KEY='+shlex.quote(key)+'\n')
PY
python - <<'PY'
import yaml
path='/etc/portal.yaml'
with open(path) as f: config=yaml.safe_load(f)
config.setdefault('applications',{})['AI Video Studio']={'hostname':'localhost','external_port':10100,'internal_port':8000,'open_path':'/health','name':'AI Video Studio'}
with open(path,'w') as f: yaml.safe_dump(config,f,sort_keys=False)
PY
cat > /opt/supervisor-scripts/studio_worker.sh <<'SH'
#!/bin/bash
set -e
utils=/opt/supervisor-scripts/utils
. "$utils/logging.sh"
. "$utils/environment.sh"
. "$utils/exit_portal.sh" 'AI Video Studio'
source /venv/studio/bin/activate
source /workspace/.studio-worker.env
cd /workspace/ai-video-studio
pty bash scripts/start-wan-vast.sh 2>&1
SH
cat > /opt/supervisor-scripts/studio_tunnel.sh <<'SH'
#!/bin/bash
set -e
utils=/opt/supervisor-scripts/utils
. "$utils/logging.sh"
. "$utils/environment.sh"
. "$utils/exit_portal.sh" 'AI Video Studio'
# TLS terminates at Cloudflare; the origin is an authenticated loopback API.
# No certificate verification is disabled. Quick tunnel is Preview-only.
pty /opt/instance-tools/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8000 2>&1
SH
chmod 755 /opt/supervisor-scripts/studio_worker.sh /opt/supervisor-scripts/studio_tunnel.sh
for service in studio_worker studio_tunnel; do
  cat > "/etc/supervisor/conf.d/$service.conf" <<CONF
[program:$service]
environment=PROC_NAME="%(program_name)s"
command=/opt/supervisor-scripts/$service.sh
autostart=true
autorestart=unexpected
stdout_logfile=/dev/stdout
redirect_stderr=true
stdout_logfile_maxbytes=0
CONF
done
supervisorctl reread
supervisorctl update
python - <<'PY'
import json, pathlib, re, time, urllib.request
for _ in range(45):
    path=pathlib.Path('/var/log/portal/studio_tunnel.log')
    urls=re.findall(r'https://[a-z0-9-]+\.trycloudflare\.com',path.read_text(errors='replace')) if path.exists() else []
    if urls:
        url=urls[-1]
        with pathlib.Path('/workspace/.studio-worker.env').open('a') as f: f.write('export PUBLIC_OUTPUT_BASE_URL='+url+'\n')
        pathlib.Path('/workspace/wan-preview-endpoint.json').write_text(json.dumps({'url':url,'stable':False}))
        print('Preview HTTPS origin:',url)
        break
    time.sleep(1)
else: raise RuntimeError('Cloudflare Preview tunnel did not publish an origin')
PY
supervisorctl restart studio_worker
python - <<'PY'
import json, time, urllib.request, urllib.error
for _ in range(30):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=5) as r: health=json.load(r)
        assert health['gpu']['available'] and health['wan']['ready'] and health['tts']
        print('Local worker health:',json.dumps(health))
        break
    except (urllib.error.URLError,AssertionError): time.sleep(1)
else: raise RuntimeError('Wan worker readiness failed')
PY
source /workspace/.studio-worker.env
export GPU_API_URL=$PUBLIC_OUTPUT_BASE_URL
python "$STUDIO_REPO/scripts/gpu-smoke-test.py"
printf '%s\n' 'Authenticated HTTPS Preview smoke test passed. Quick tunnel changes on restart; not a Production address.'
