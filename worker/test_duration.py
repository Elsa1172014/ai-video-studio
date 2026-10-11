import asyncio, tempfile, unittest
from pathlib import Path
from unittest.mock import patch, AsyncMock
import render as r
import production as p

class DurationTests(unittest.IsolatedAsyncioTestCase):
 async def test_exact_final_with_longer_voice_and_short_clip(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d); video=root/'v.mp4'; audio=root/'a.wav'
   await r.run([r.ffmpeg_bin(),'-y','-f','lavfi','-i','color=c=blue:s=128x72:r=24','-t','1','-c:v','libx264',str(video)])
   await r.run([r.ffmpeg_bin(),'-y','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2.3',str(audio)])
   with patch.object(r,'OUTPUT_DIR',root),patch.object(r,'public_url',lambda x:str(x)),patch('fetch.fetch_media',lambda url,*_:Path(url)):
    result=await r.render(r.RenderRequest(scenes=[r.RenderScene(clips=[str(video)],audio=str(audio),duration=2),r.RenderScene(clips=[str(video)],duration=3)],strictDuration=True,width=128,height=72))
    self.assertAlmostEqual(await r.duration(Path(result)),5,delta=.06)
    with self.assertRaisesRegex(RuntimeError,'أطول'):
     await r.render(r.RenderRequest(scenes=[r.RenderScene(clips=[str(video)],audio=str(audio),duration=1)],strictDuration=True,width=128,height=72))

 async def test_voice_overflow_stops_before_gpu(self):
  req=p.ProductionRequest(scenes=[p.ProductionScene(sceneId='one',duration=5,shots=[p.ProductionShot(prompt='city park',duration=5)],voice={'text':'hello'})])
  adapter=type('Adapter',(),{'generate':AsyncMock()})()
  with patch.object(p,'cached',AsyncMock(return_value='/outputs/voice.wav')),patch.object(p,'duration',AsyncMock(return_value=20)),patch('fetch.fetch_media',lambda *_:Path('/voice.wav')),patch.dict(p.ADAPTERS,{'wan':adapter}):
   with self.assertRaisesRegex(RuntimeError,'أطول'):await p.produce(req,lambda _:None,asyncio.Semaphore(1))
   adapter.generate.assert_not_awaited()

 async def test_cached_batch_continues_without_browser(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);calls=[];progress=[]
   async def generate(*_,**kwargs):
    calls.append('video');out=root/'video.mp4';out.touch();return '/outputs/video.mp4'
   adapter=type('Adapter',(),{'generate':staticmethod(generate)})()
   req=p.ProductionRequest(scenes=[p.ProductionScene(sceneId='one',duration=5,shots=[p.ProductionShot(prompt='city park',duration=5)])])
   with patch.object(p,'OUTPUT_DIR',root),patch.dict(p.ADAPTERS,{'wan':adapter}),patch.object(p,'render',AsyncMock(return_value='/outputs/final.mp4')):
    for _ in range(2):self.assertEqual(await p.produce(req,progress.append,asyncio.Semaphore(1)),'/outputs/final.mp4')
    self.assertEqual(calls,['video']);self.assertTrue(any(x.get('stage')=='render' for x in progress))

if __name__=='__main__':unittest.main()
