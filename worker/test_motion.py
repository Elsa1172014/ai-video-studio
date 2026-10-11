import tempfile, unittest, asyncio
from pathlib import Path
from unittest.mock import patch
from production import ProductionScene,ProductionShot
import motion,render

class MotionTests(unittest.IsolatedAsyncioTestCase):
 def test_numeric_ranges_keep_source_order_in_rtl(self):
  self.assertIn('\u202a500-600\u202c',motion.display_text('المرافق على مسافة 500-600 متر'))

 async def test_arabic_motion_and_ducked_score_produce_exact_video(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);progress=[]
   scene=ProductionScene(sceneId='one',duration=5,title='أنسنة المدن',narration='الإنسان أساس تخطيط المدينة.',evidence=['المرافق على مسافة 500-600 متر.'],shots=[ProductionShot(prompt='city',duration=5)])
   with patch.object(motion,'OUTPUT_DIR',root),patch.object(motion,'public_url',lambda p:str(p)),patch.object(render,'OUTPUT_DIR',root),patch.object(render,'public_url',lambda p:str(p)),patch('fetch.fetch_media',lambda u,*_:Path(u)):
    clip=await motion.generate_scene(scene,640,360,progress=progress.append)
    result=await render.render(render.RenderRequest(strictDuration=True,scenes=[render.RenderScene(clips=[clip],duration=5)],width=640,height=360,music='cinematic',musicVolume=.12))
    self.assertAlmostEqual(await render.duration(Path(result)),5,delta=.08)
    self.assertEqual(progress[-1],1)
    self.assertGreater(Path(result).stat().st_size,1000)

if __name__=='__main__':unittest.main()
