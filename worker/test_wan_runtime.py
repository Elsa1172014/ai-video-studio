import os, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from wan_runtime import command

class WanCommandTests(unittest.TestCase):
 def test_official_args_frames_and_literal_prompt(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d); (root/'generate.py').touch(); (root/'config.json').touch()
   with patch.dict(os.environ, {'WAN_DIR':d,'WAN_CKPT_DIR':d}):
    _, args=command('city; $(echo unsafe)',3,root/'out.mp4',720,1280)
    self.assertEqual(args[args.index('--size')+1], '704*1280')
    self.assertEqual(args[args.index('--frame_num')+1], '73')
    self.assertEqual(args[args.index('--prompt')+1], 'city; $(echo unsafe)')
    with self.assertRaises(RuntimeError): command('city',30,root/'out.mp4')
 def test_missing_runtime_is_actionable(self):
  with patch.dict(os.environ, {'WAN_DIR':'/missing-wan','WAN_CKPT_DIR':'/missing-weights'}):
   with self.assertRaisesRegex(RuntimeError,'runtime/weights missing'): command('city',3,Path('/tmp/out.mp4'))

if __name__=='__main__': unittest.main()
