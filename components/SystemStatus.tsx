'use client';
import {arabicLabel, arabicNotice} from '@/lib/arabic';
import {useEffect,useState} from 'react';

type Health={web?:boolean;gpu?:boolean;gpuMessage?:string;database?:{durable:boolean;ok:boolean};storage?:{durable:boolean;driver:string}};

export default function SystemStatus(){
  const[s,setS]=useState<Health|null>(null);
  useEffect(()=>{
    fetch('/api/health').then(r=>r.json()).then((x:Health)=>setS(x)).catch(()=>setS({web:true,gpu:false}));
  },[]);
  const dot=(ok?:boolean)=>'h-2 w-2 rounded-full '+(ok?'bg-emerald-400':'bg-amber-400');
  return <div className="flex flex-wrap items-center gap-2 text-xs">
    <span className={'h-2 w-2 rounded-full '+(s?.web?'bg-emerald-400':'bg-slate-500')}/>
    <span>المنصة</span>
    <span className={'ms-2 '+dot(s?.gpu)}/>
    <span title={s?.gpuMessage ? arabicNotice(s.gpuMessage) : undefined}>{s?.gpu?'خادم التوليد متصل':'خادم التوليد غير جاهز'}</span>
    <span className={'ms-2 '+dot(s?.database?.durable&&s?.database?.ok)}/>
    <span>{s?.database?.durable?'قاعدة البيانات':'بيانات محلية'}</span>
    <span className={'ms-2 '+dot(s?.storage?.durable)}/>
    <span>{s?.storage?.durable?'التخزين':'وسائط محلية'}</span>
  </div>;
}