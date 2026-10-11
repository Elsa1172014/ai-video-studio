import os,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from readiness import wan_ready

class ReadinessTests(unittest.TestCase):
 def test_config_without_weights_is_not_ready(self):
  with tempfile.TemporaryDirectory() as d,patch.dict(os.environ,{'WAN_DIR':d,'WAN_CKPT_DIR':d}):
   root=Path(d);(root/'generate.py').touch();(root/'config.json').touch()
   self.assertFalse(wan_ready()['ready'])
   (root/'part.safetensors').touch()
   self.assertFalse(wan_ready()['ready'])
   (root/'part.safetensors').write_bytes(b'installation-fixture')
   self.assertTrue(wan_ready()['ready'])
