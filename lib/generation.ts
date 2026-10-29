import type {FinishOptions} from './video-tools';

export type GenerateRequest={provider:string;prompt:string;duration:number;imageUrl?:string};
export type JobStatus='queued'|'processing'|'completed'|'failed';
export type FinishReport={steps:string[];warnings:string[];duration:number;size:string};
export type GenerateResult={jobId:string;status:JobStatus;provider:string;outputUrl?:string;captionsUrl?:string|null;report?:FinishReport;message?:string};

const runpodConfigured=()=>Boolean(process.env.RUNPOD_ENDPOINT_ID&&process.env.RUNPOD_API_KEY);
const runpodBase=()=>`https://api.runpod.ai/v2/${process.env.RUNPOD_ENDPOINT_ID}`;
const runpodHeaders=()=>({Authorization:`Bearer ${process.env.RUNPOD_API_KEY}`,'Content-Type':'application/json'});
const workerBase=()=>process.env.GPU_API_URL?.replace(/\/$/,'');

function workerHeaders(key?:string):Record<string,string>{return key?{Authorization:`Bearer ${key}`}:{}}
async function providerError(response:Response):Promise<Error>{let detail='';try{detail=(await response.text()).slice(0,800)}catch{};if(response.status===401)return new Error('GPU authentication failed (401). Check the configured GPU credentials.');return new Error(`Generation provider returned ${response.status}${detail?`: ${detail}`:''}`)}

/** Worker outputs are served from /outputs on the worker; make relative URLs absolute for the browser proxy. */
function absolutize(result:GenerateResult):GenerateResult{
 const base=workerBase();
 if(base){
  if(result.outputUrl?.startsWith('/'))result.outputUrl=base+result.outputUrl;
  if(result.captionsUrl?.startsWith('/'))result.captionsUrl=base+result.captionsUrl;
 }
 return result;
}

function normalizeRunpod(job:any,provider='ltx'):GenerateResult{
 const raw=String(job?.status||'').toUpperCase();
 const output=job?.output||{};
 const outputUrl=output.outputUrl||output.url;
 const message=output.message||job?.error;
 if(raw==='COMPLETED'){
  if(output.status==='failed')return{jobId:job.id,status:'failed',provider,message:message||'Runpod worker failed'};
  if(outputUrl&&String(outputUrl).startsWith('/'))return{jobId:job.id,status:'failed',provider,message:'GPU finished, but the video is stored only on the Runpod volume. Configure PUBLIC_OUTPUT_BASE_URL/object storage so the browser can access generated MP4 files.'};
  return{jobId:job.id,status:'completed',provider,outputUrl,captionsUrl:output.captionsUrl??null,report:output.report,message};
 }
 if(['FAILED','CANCELLED','TIMED_OUT'].includes(raw))return{jobId:job.id,status:'failed',provider,message:message||raw};
 return{jobId:job.id,status:raw==='IN_PROGRESS'?'processing':'queued',provider,message};
}

async function submitRunpod(input:any):Promise<GenerateResult>{
 const r=await fetch(runpodBase()+'/run',{method:'POST',headers:runpodHeaders(),body:JSON.stringify({input}),cache:'no-store'});
 if(!r.ok)throw await providerError(r);
 return normalizeRunpod(await r.json(),input.provider||input.action||'ltx');
}
async function getRunpod(jobId:string):Promise<GenerateResult>{
 const r=await fetch(runpodBase()+'/status/'+encodeURIComponent(jobId),{headers:runpodHeaders(),cache:'no-store'});
 if(!r.ok)throw await providerError(r);
 return normalizeRunpod(await r.json());
}

const unconfigured=(provider:string,jobId:string=crypto.randomUUID()):GenerateResult=>({jobId,status:'failed',provider,message:'GPU is not configured. Set RUNPOD_ENDPOINT_ID + RUNPOD_API_KEY, or GPU_API_URL for the HTTP worker.'});

export async function submitGeneration(input:GenerateRequest):Promise<GenerateResult>{
 if(runpodConfigured())return submitRunpod({action:'generate',...input});
 const base=workerBase(),key=process.env.GPU_API_KEY;
 if(!base)return unconfigured(input.provider);
 const r=await fetch(base+'/generate',{method:'POST',headers:{'Content-Type':'application/json',...workerHeaders(key)},body:JSON.stringify(input),cache:'no-store'});
 if(!r.ok)throw await providerError(r);
 return absolutize(await r.json());
}

/** Join scene clips. With `finish`, the worker runs the cinematic pipeline (Kinocut + HyperFrames + captions). */
export async function submitRender(clips:string[],finish?:FinishOptions):Promise<GenerateResult>{
 if(runpodConfigured())return submitRunpod({action:'render',clips,...(finish?{finish}:{})});
 const base=workerBase(),key=process.env.GPU_API_KEY;
 if(!base)return unconfigured('render');
 const r=await fetch(base+'/render',{method:'POST',headers:{'Content-Type':'application/json',...workerHeaders(key)},body:JSON.stringify({clips,...(finish?{finish}:{})}),cache:'no-store'});
 if(!r.ok)throw await providerError(r);const result:any=await r.json();
 return absolutize({jobId:result.jobId||crypto.randomUUID(),provider:'render',...result});
}

export async function getGeneration(jobId:string):Promise<GenerateResult>{
 if(runpodConfigured())return getRunpod(jobId);
 const base=workerBase(),key=process.env.GPU_API_KEY;
 if(!base)return unconfigured('unconfigured',jobId);
 const r=await fetch(base+`/jobs/${encodeURIComponent(jobId)}`,{headers:workerHeaders(key),cache:'no-store'});
 if(!r.ok)throw await providerError(r);
 return absolutize(await r.json());
}

export async function submitVoice(input:{text:string;language:string;voice:string}):Promise<GenerateResult>{
 if(runpodConfigured())return submitRunpod({action:'voice',...input,provider:'voice'});
 const base=workerBase(),key=process.env.GPU_API_KEY;
 if(!base)return unconfigured('voice');
 const r=await fetch(base+'/voice',{method:'POST',headers:{'Content-Type':'application/json',...workerHeaders(key)},body:JSON.stringify(input),cache:'no-store'});
 if(!r.ok)throw await providerError(r);const result:any=await r.json();
 return absolutize({jobId:crypto.randomUUID(),provider:'voice',...result});
}

/** Upload to the HTTP worker's /media endpoint. Runpod workers have no public upload endpoint. */
export async function uploadMedia(file:File):Promise<{id:string;name:string;url:string}>{
 const base=workerBase(),key=process.env.GPU_API_KEY;
 if(!base)throw new Error(runpodConfigured()?'Uploads need the HTTP worker (GPU_API_URL) or object storage. With Runpod, paste a public URL instead.':'GPU worker is not configured.');
 const form=new FormData();form.append('file',file,file.name);
 const r=await fetch(base+'/media',{method:'POST',headers:workerHeaders(key),body:form,cache:'no-store'});
 if(!r.ok)throw await providerError(r);
 const result=await r.json();
 return {...result,url:result.url?.startsWith('/')?base+result.url:result.url};
}

export type WorkerCapabilities={ffmpeg?:boolean;kinocut?:boolean;hyperframes?:boolean;tts?:boolean;whisper?:boolean;finishing?:boolean};

export async function workerCapabilities():Promise<{provider:'runpod'|'http'|'none';providers:string[];capabilities:WorkerCapabilities|null;error?:string}>{
 if(runpodConfigured()){
  // Runpod has no synchronous capability call; the image built from worker/Dockerfile.runpod ships all finishing tools.
  return {provider:'runpod',providers:['ltx','wan','avatar','lipsync'],capabilities:{ffmpeg:true,kinocut:true,hyperframes:true,finishing:true}};
 }
 const base=workerBase();
 if(!base)return {provider:'none',providers:[],capabilities:null};
 try{
  const r=await fetch(base+'/health',{headers:workerHeaders(process.env.GPU_API_KEY),cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!r.ok)return {provider:'http',providers:[],capabilities:null,error:`Worker returned ${r.status}`};
  const data=await r.json();
  return {provider:'http',providers:data.providers||[],capabilities:data.capabilities||null};
 }catch(e){return {provider:'http',providers:[],capabilities:null,error:e instanceof Error?e.message:'Worker unreachable'}}
}
