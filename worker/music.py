"""Original procedural accompaniment; no external music catalogue or downloads."""
import math, wave, array
from pathlib import Path

def compose(path:Path,seconds:float,kind:str):
 rate=24000;chords=[(130.81,164.81,196.00),(110,130.81,164.81),(87.31,110,130.81),(98,123.47,146.83)]
 with wave.open(str(path),'wb') as out:
  out.setparams((1,2,rate,0,'NONE','not compressed'))
  for start in range(0,math.ceil(seconds),1):
   samples=array.array('h')
   for i in range(min(rate,max(0,int(seconds*rate)-start*rate))):
    t=start+i/rate;phase=t%4;attack=min(1,phase/.7);release=min(1,(4-phase)/.7)
    envelope=min(1,t/2,max(0,(seconds-t)/2))*attack*release
    tones=chords[int(t/4)%4];value=sum(math.sin(2*math.pi*f*t)+.22*math.sin(2*math.pi*2*f*t) for f in tones)/4
    if kind=='cinematic':value+=.18*math.sin(2*math.pi*55*t)*math.exp(-8*(t%.5))
    samples.append(int(max(-1,min(1,value*.35*envelope))*32767))
   out.writeframes(samples.tobytes())
