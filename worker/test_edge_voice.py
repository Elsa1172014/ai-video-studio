import asyncio, os, sys, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from edge_voice import generate, voice_name

class EdgeVoiceTests(unittest.IsolatedAsyncioTestCase):
 def test_default_and_invalid_voices(self):
  self.assertEqual(voice_name('ar-AE','default'),'ar-AE-HamdanNeural')
  self.assertEqual(voice_name('en','default'),'en-US-GuyNeural')
  with self.assertRaises(RuntimeError):voice_name('ar','$(unsafe)')

 async def test_timeout_removes_partial_audio(self):
  class Slow:
   def __init__(self,*args):pass
   async def save(self,path):
    Path(path).write_bytes(b'partial')
    await asyncio.Event().wait()
  with tempfile.TemporaryDirectory() as d, patch.dict(sys.modules,{'edge_tts':SimpleNamespace(Communicate=Slow)}), patch.dict(os.environ,{'TTS_TIMEOUT_SECONDS':'1'}):
   out=Path(d)/'audio.mp3'
   with self.assertRaises(TimeoutError):await generate('مرحبا','ar','default',out)
   self.assertFalse(out.exists())

 async def test_empty_audio_is_rejected(self):
  class Empty:
   def __init__(self,*args):pass
   async def save(self,path):Path(path).touch()
  with tempfile.TemporaryDirectory() as d, patch.dict(sys.modules,{'edge_tts':SimpleNamespace(Communicate=Empty)}):
   out=Path(d)/'audio.mp3'
   with self.assertRaisesRegex(RuntimeError,'no audio'):await generate('مرحبا','ar','default',out)
   self.assertFalse(out.exists())
