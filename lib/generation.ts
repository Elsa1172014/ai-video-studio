export type GenerateRequest={provider:string;prompt:string;duration:number;imageUrl?:string};
export type GenerateResult={jobId:string;status:'queued'|'processing'|'completed'|'failed';provider:string;outputUrl?:string;message?:string};

const runpodConfigured=()=>Boolean(process.env.RUNPOD_ENDPOINT_ID&&process.env.RUNPOD_API_KEY);
const useRunpod=()=>process.env.GPU_PROVIDER==='runpod'||(!process.env.GPU_PROVIDER&&runpodConfigured());
function workerBase(){const value=process.env.GPU_API_URL;if(!value)return undefined;const url=new URL(value);if(url.protocol!=='https:'&&!(process.env.NODE_ENV!=='production'&&url.hostname==='localhost'))throw new Error('GPU_API_URL must use HTTPS in production');return url.toString().replace(/\/$/,'');}
const runpodBase=()=>`https://api.runpod.ai/v2/${process.env.RUNPOD_ENDPOINT_ID}`;
const runpodHeaders=()=>({Authorization:`Bearer ${process.env.RUNPOD_API_KEY}`,'Content-Type':'application/json'});

function workerHeaders(key?:string):Record<string,string>{return key?{Authorization:`Bearer ${key}`}:{}}
async function providerError(response:Response):Promise<Error>{let detail='';try{detail=(await response.text()).slice(0,800)}catch{};if(response.status===401)return new Error('GPU authentication failed (401). Check the configured GPU credentials.');return new Error(`Generation provider returned ${response.status}${detail?`: ${detail}`:''}`)}

function normalizeRunpod(job:any,provider='ltx'):GenerateResult{
 const raw=String(job?.status||'').toUpperCase();
 const output=job?.output||{};
 const outputUrl=output.outputUrl||output.url;
 const message=output.message||job?.error;
 if(raw==='COMPLETED'){
  if(output.status==='failed')return{jobId:job.id,status:'failed',provider,message:message||'Runpod worker failed'};
  if(outputUrl&&String(outputUrl).startsWith('/'))return{jobId:job.id,status:'failed',provider,message:'GPU finished, but the video is stored only on the Runpod volume. Configure PUBLIC_OUTPUT_BASE_URL/object storage so the browser can access generated MP4 files.'};
  return{jobId:job.id,status:'completed',provider,outputUrl,message};
 }
 if(['FAILED','CANCELLED','TIMED_OUT'].includes(raw))return{jobId:job.id,status:'failed',provider,message:message||raw};
 return{jobId:job.id,status:raw==='IN_PROGRESS'?'processing':'queued',provider,message};
}

async function submitRunpod(input:any):Promise<GenerateResult>{
 const r=await fetch(runpodBase()+'/run',{method:'POST',headers:runpodHeaders(),body:JSON.stringify({input}),cache:'no-store'});
 if(!r.ok)throw await providerError(r);
 const job=await r.json();
 return normalizeRunpod(job,input.provider||'ltx');
}
async function getRunpod(jobId:string):Promise<GenerateResult>{
 const r=await fetch(runpodBase()+'/status/'+encodeURIComponent(jobId),{headers:runpodHeaders(),cache:'no-store'});
 if(!r.ok)throw await providerError(r);
 return normalizeRunpod(await r.json());
}

export async function submitGeneration(input:GenerateRequest):Promise<GenerateResult>{
 if(useRunpod()){if(!runpodConfigured())throw new Error('RunPod selected but credentials are missing');return submitRunpod({action:'generate',...input});}
 const base=workerBase(),key=process.env.GPU_API_KEY;
 if(!base)return{jobId:crypto.randomUUID(),status:'failed',provider:input.provider,message:'GPU is not configured. Set GPU_PROVIDER=vast with GPU_API_URL and GPU_API_KEY for your Vast.ai-hosted worker, or configure RunPod explicitly.'};
 const r=await fetch(base.replace(/\/$/,'')+'/generate',{method:'POST',headers:{'Content-Type':'application/json',...workerHeaders(key)},body:JSON.stringify(input),cache:'no-store'});
 if(!r.ok)throw await providerError(r);const result:GenerateResult=await r.json();
 if(result.outputUrl?.startsWith('/'))result.outputUrl=base.replace(/\/$/,'')+result.outputUrl;
 return result;
}
export async function submitRender(clips:string[]):Promise<GenerateResult>{
 if(useRunpod()){if(!runpodConfigured())throw new Error('RunPod selected but credentials are missing');return submitRunpod({action:'render',clips});}
 const base=workerBase(),key=process.env.GPU_API_KEY;
 if(!base)return{jobId:crypto.randomUUID(),status:'failed',provider:'render',message:'GPU is not configured'};
 const r=await fetch(base.replace(/\/$/,'')+'/render',{method:'POST',headers:{'Content-Type':'application/json',...workerHeaders(key)},body:JSON.stringify({clips}),cache:'no-store'});
 if(!r.ok)throw await providerError(r);const result:any=await r.json();
 return{jobId:result.jobId||crypto.randomUUID(),provider:'render',...result};
}
export async function getGeneration(jobId:string):Promise<GenerateResult>{
 if(useRunpod()){if(!runpodConfigured())throw new Error('RunPod selected but credentials are missing');return getRunpod(jobId);}
 const base=workerBase(),key=process.env.GPU_API_KEY;
 if(!base)return{jobId,status:'failed',provider:'unconfigured',message:'GPU is not configured'};
 const r=await fetch(base.replace(/\/$/,'')+`/jobs/${encodeURIComponent(jobId)}`,{headers:workerHeaders(key),cache:'no-store'});
 if(!r.ok)throw await providerError(r);const result:GenerateResult=await r.json();
 if(result.outputUrl?.startsWith('/'))result.outputUrl=base.replace(/\/$/,'')+result.outputUrl;
 return result;
}