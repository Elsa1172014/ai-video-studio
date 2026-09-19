export type GenerateRequest={provider:string;prompt:string;duration:number;imageUrl?:string};
export type GenerateResult={jobId:string;status:'queued'|'processing'|'completed'|'failed';provider:string;outputUrl?:string;message?:string};

function normalizeResult(result:GenerateResult,base:string):GenerateResult{
  if(result.outputUrl?.startsWith('/')){
    return {...result,outputUrl:base.replace(/\/$/,'')+result.outputUrl};
  }
  return result;
}

function workerHeaders(key?:string):Record<string,string>{
  return key ? {Authorization:`Bearer ${key}`} : {};
}

async function providerError(response:Response):Promise<Error>{
  let detail='';
  try{detail=(await response.text()).slice(0,500)}catch{}
  if(response.status===401){
    return new Error('GPU authentication failed (401). Check the Lightning deployment authentication and GPU_API_KEY configuration.');
  }
  return new Error(`Generation provider returned ${response.status}${detail?`: ${detail}`:''}`);
}

export async function submitGeneration(input:GenerateRequest):Promise<GenerateResult>{
  const base=process.env.GPU_API_URL;
  const key=process.env.GPU_API_KEY;
  if(!base)return{jobId:crypto.randomUUID(),status:'queued',provider:input.provider,message:'GPU endpoint is not configured yet'};
  const r=await fetch(base.replace(/\/$/,'')+'/generate',{
    method:'POST',
    headers:{'Content-Type':'application/json',...workerHeaders(key)},
    body:JSON.stringify(input),
    cache:'no-store'
  });
  if(!r.ok)throw await providerError(r);
  const result:GenerateResult=await r.json();
  return normalizeResult(result,base);
}

export async function getGeneration(jobId:string):Promise<GenerateResult>{
  const base=process.env.GPU_API_URL;
  const key=process.env.GPU_API_KEY;
  if(!base)return{jobId,status:'queued',provider:'unconfigured',message:'GPU endpoint is not configured yet'};
  const r=await fetch(base.replace(/\/$/,'')+`/jobs/${encodeURIComponent(jobId)}`,{
    headers:workerHeaders(key),
    cache:'no-store'
  });
  if(!r.ok)throw await providerError(r);
  const result:GenerateResult=await r.json();
  return normalizeResult(result,base);
}
