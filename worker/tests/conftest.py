import os,tempfile
_tmp=tempfile.mkdtemp(prefix="avs-test-")
os.environ["OUTPUT_DIR"]=_tmp
os.environ["JOB_DIR"]=os.path.join(_tmp,"jobs")
os.environ.pop("PUBLIC_OUTPUT_BASE_URL",None)
os.environ.pop("GPU_API_KEY",None)
