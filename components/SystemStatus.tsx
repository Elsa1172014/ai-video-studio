'use client';
import {useEffect,useState} from 'react';

type Health={web?:boolean;gpu?:boolean;gpuMessage?:string;database?:{durable:boolean;ok:boolean};storage?:{durable:boolean;driver:string}};

export default function SystemStatus(){
  const[s,setS]=useState<Health|null>(null);
  useEffect(()=>{
    fetch('/api/health').then(r=>r.json()).then((x:Health)=>setS(x)).catch(()=>setS({web:true,gpu:false}));
  },[]);
  const dot=(ok?:boolean)=>'h-2 w-2 rounded-full '+(ok?'bg-emerald-400':'bg-amber-400');
  return <div className="flex items-center gap-2 text-xs">
    <span className={'h-2 w-2 rounded-full '+(s?.web?'bg-emerald-400':'bg-slate-500')}/>
    <span>Web</span>
    <span className={'ml-2 '+dot(s?.gpu)}/>
    <span title={s?.gpuMessage}>{s?.gpu?'GPU connected':'GPU pending'}</span>
    <span className={'ml-2 '+dot(s?.database?.durable&&s?.database?.ok)}/>
    <span>{s?.database?.durable?'Database':'Local data'}</span>
    <span className={'ml-2 '+dot(s?.storage?.durable)}/>
    <span>{s?.storage?.durable?'Storage':'Local media'}</span>
  </div>;
}
