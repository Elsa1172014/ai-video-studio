"""Fast, honest educational motion graphics: text, evidence, diagrams and supplied images."""
import asyncio, math, os, re, tempfile, shutil, uuid
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
from storage import OUTPUT_DIR, public_url
from render import run, ffmpeg_bin
from fetch import fetch_media

def font(size):
 for path in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf']:
  if Path(path).exists():return ImageFont.truetype(path,size)
 raise RuntimeError('خط عرض النص العربي غير متاح على الخادم.')

def lines(text,f,width,draw):
 result=[];line=''
 for word in text.split():
  test=(line+' '+word).strip()
  if draw.textlength(test,font=f)>width and line:result.append(line);line=word
  else:line=test
 if line:result.append(line)
 return result

def chunks(text,limit=24):
 words=text.split();return [' '.join(words[i:i+limit]) for i in range(0,len(words),limit)]

def card(scene, text, label, page, count, images, width, height, format='explainer',style=''):
 im=Image.new('RGB',(width,height),(12,19,35));d=ImageDraw.Draw(im)
 scale=width/1280; margin=int(width*.07);f=font(max(18,int(34*scale)));small=font(max(16,int(22*scale)))
 d.rounded_rectangle((margin,margin,width-margin,height-margin),radius=int(28*scale),fill=(38,28,43) if format=='story' else (19,42,49) if format=='dialogue' else (20,34,54),outline=(48,72,92),width=2)
 d.rectangle((width-margin-8,margin+24,width-margin-3,height-margin-24),fill=(74,210,185))
 def write(value,y,ft,color,maxwidth=None):
  for line in lines(value,ft,maxwidth or width-2*margin-65,d):
   d.text((width-margin-30,y),line,font=ft,anchor='ra',fill=color,direction='rtl' if re.search('[\u0600-\u06ff]',line) else 'ltr');y+=int(ft.size*1.55)
  return y
 y=write(label,margin+20,small,(74,210,185))
 y=write(text,y+20,f,(244,246,250))
 # A schematic, not invented real footage. City diagrams only for city-related source.
 ground=height-margin-60
 if not images:
  if re.search('مدن|مدينة|حي|مرافق|شوارع',scene.narration+' '+scene.title):
   base=int(ground-100*scale)
   if y+40<base:
    for k in range(6):
     x=margin+40+int(k*120*scale);h=int((60+(k%3)*25)*scale)
     d.rounded_rectangle((x,base-h,x+int(70*scale),base),radius=6,fill=(35,87,104))
     for j in range(2):d.rectangle((x+15+j*25,base-h+18,x+25+j*25,base-h+29),fill=(109,201,187))
    d.line((margin+30,base+25,width-margin-35,base+25),fill=(222,180,99),width=5)
    for k in range(3):
     x=width-margin-80-k*60;d.line((x,base-5,x,base+16),fill=(151,131,98),width=4);d.ellipse((x-20,base-42,x+20,base-2),fill=(44,145,114))
  elif y+70<ground:
   for k in range(3):
    x=int(width*(.28+.22*k));d.ellipse((x-25,ground-65,x+25,ground-15),fill=(45,121,137));
    if k<2:d.line((x+28,ground-40,x+int(width*.22)-28,ground-40),fill=(74,210,185),width=3)
 else:
  thumb=int(min(height*.21,width*.17));top=max(y+18,height-margin-thumb-52)
  if top+thumb<height-margin-20:
   for k,(photo,name,role) in enumerate(images[:4]):
    x=width-margin-35-(k+1)*(thumb+22)
    im.paste(ImageOps.fit(photo,(thumb,thumb)),(x,int(top)))
    d.text((x+thumb,int(top)+thumb+5),(name+' · '+role)[:45],font=small,anchor='ra',fill=(200,221,228),direction='rtl' if re.search('[\u0600-\u06ff]',name) else 'ltr')
 d.text((margin+22,height-margin-30),f'{page+1} / {count}',font=small,fill=(117,146,167))
 return im

async def generate_scene(scene,width,height,format='explainer',progress=None,style=''):
 work=Path(tempfile.mkdtemp(prefix='motion-',dir=str(OUTPUT_DIR)))
 try:
  images=[]
  for item in scene.images:
   path=await asyncio.to_thread(fetch_media,item.url,work,'.jpg')
   with Image.open(path) as im:images.append((im.convert('RGB'),item.name,item.role))
  pages=[('الفكرة المركزية',t) for t in chunks(scene.title,22)]
  pages += [('شرح الفكرة',t) for t in chunks(scene.narration,24)]
  pages += [('الدليل من النص',t) for e in scene.evidence for t in chunks(e,24)]
  if not pages:pages=[('المشهد',scene.visual)]
  while len(pages)<math.ceil(len(images)/4):pages.append(('الشخصيات',scene.title))
  duration=scene.duration/len(pages)
  outputs=[]
  for i,(label,text) in enumerate(pages):
   pic=work/f'{i}.png';out=work/f'{i}.mp4'
   await asyncio.to_thread(lambda:card(scene,text,label,i,len(pages),images[(i%max(1,math.ceil(len(images)/4)))*4:][:4],width,height,format,style).save(pic))
   frames=max(1,round(duration*24));vf=f"scale={width}:{height},zoompan=z='min(zoom+0.00018,1.035)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d={frames}:s={width}x{height}:fps=24,fade=t=in:st=0:d=0.2"
   await run([ffmpeg_bin(),'-y','-i',str(pic),'-vf',vf,'-frames:v',str(frames),'-an','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-threads','2',str(out)])
   outputs.append(out)
   if progress:progress((i+1)/len(pages))
  manifest=work/'list.txt';manifest.write_text(''.join(f"file '{p}'\n" for p in outputs))
  final=OUTPUT_DIR/f'{uuid.uuid4()}.mp4'
  await run([ffmpeg_bin(),'-y','-f','concat','-safe','0','-i',str(manifest),'-c','copy',str(final)])
  return public_url(final)
 finally:shutil.rmtree(work,ignore_errors=True)
