#!/usr/bin/env python3
"""Non-destructive GPU worker smoke test. No inference charges unless --generate is set."""
import argparse, json, os, sys, urllib.error, urllib.request

p=argparse.ArgumentParser()
p.add_argument("--url",default=os.getenv("GPU_API_URL",""))
p.add_argument("--generate",action="store_true",help="Submit a real, billable Wan inference job")
p.add_argument("--timeout",type=int,default=20)
args=p.parse_args()
if not args.url.startswith("https://"):
    sys.exit("ERROR: provide an HTTPS GPU_API_URL; refusing insecure credentials")
key=os.getenv("GPU_API_KEY","")
if not key: sys.exit("ERROR: GPU_API_KEY is missing")
base=args.url.rstrip("/")
def call(path,payload=None):
    data=None if payload is None else json.dumps(payload).encode()
    headers={"Authorization":"Bearer "+key}
    if data: headers["Content-Type"]="application/json"
    req=urllib.request.Request(base+path,data=data,headers=headers,method="POST" if data else "GET")
    with urllib.request.urlopen(req,timeout=args.timeout) as res:
        return json.load(res)
try:
    health=call("/health")
    print("HEALTH:",json.dumps(health,ensure_ascii=False))
    if not health.get("ok"): sys.exit("ERROR: worker health not OK")
    gpu=health.get("gpu") or {}
    if not gpu.get("available"): sys.exit("ERROR: no CUDA GPU detected")
    if not (health.get('wan') or {}).get('ready'): sys.exit('ERROR: Wan runtime/weights are not ready')
    if not health.get('tts'): sys.exit('ERROR: narration engine is not configured')
    # /health is public. Verify the bearer token on an authenticated, read-only route.
    try:
        call('/jobs/00000000-0000-0000-0000-000000000000')
    except urllib.error.HTTPError as e:
        if e.code != 404: raise
    if not args.generate:
        print("PASS: worker reachable, authenticated, CUDA and Wan installation available, narration configured. Inference not submitted.")
        sys.exit(0)
    job=call("/generate",{"provider":"wan","prompt":"A calm cinematic aerial view of a futuristic coastal city at sunrise","duration":3})
    print("WAN JOB:",json.dumps(job,ensure_ascii=False))
    print("Check /jobs/<jobId> for completion and a publicly accessible MP4 URL.")
except (urllib.error.URLError,TimeoutError,ValueError) as e:
    sys.exit("ERROR: "+str(e))
