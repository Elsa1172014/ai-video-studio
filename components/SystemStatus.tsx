'use client';
import {useEffect,useState} from 'react';

type Health={web?:boolean;gpu?:boolean};

export default function SystemStatus(){
  const[s,setS]=useState<Health|null>(null);
  useEffect(()=>{
    fetch('/api/health').then(r=>r.json()).then((x:Health)=>setS(x)).catch(()=>setS({web:true,gpu:false}));
  },[]);
  return <div className="flex items-center gap-2 text-xs">
    <span className={'h-2 w-2 rounded-full '+(s?.web?'bg-emerald-400':'bg-slate-500')}/>
    <span>Web</span>
    <span className={'ml-2 h-2 w-2 rounded-full '+(s?.gpu?'bg-emerald-400':'bg-amber-400')}/>
    <span>{s?.gpu?'GPU connected':'GPU pending'}</span>
  </div>;
}