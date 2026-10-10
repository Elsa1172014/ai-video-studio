"""Installation checks only. Real inference remains an acceptance gate."""
import os
from pathlib import Path

def wan_ready():
 root=Path(os.getenv('WAN_DIR','/opt/Wan2.2'))
 weights=Path(os.getenv('WAN_CKPT_DIR','/models/Wan2.2-TI2V-5B'))
 runtime=(root/'generate.py').is_file()
 config=(weights/'config.json').is_file()
 tensors=any(p.stat().st_size>0 for p in weights.rglob('*.safetensors')) if weights.is_dir() else False
 return {'ready':runtime and config and tensors,'runtime':runtime,'config':config,'tensors':tensors}
