import type {FinishOptions} from './video-tools';

/**
 * Free serverless backend: each scene and the final film run as a GitHub Actions job
 * (.github/workflows/studio-cloud.yml). Scenes come from Hugging Face ZeroGPU Spaces;
 * results are published as assets of the repository's "films" release.
 *
 * Env: GITHUB_CLOUD_REPO=owner/repo, GITHUB_CLOUD_TOKEN (fine-grained: Actions read/write,
 * Contents read on that repo), optional GITHUB_CLOUD_REF (default main).
 */
const WORKFLOW='studio-cloud.yml';

/** Strip invisible direction marks, quotes and spaces that sneak in when values are pasted on a phone. */
const clean=(v?:string)=>(v||'').replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF"'`\s]/g,'');

/** Find the token even if it was saved under another common name, or pasted into the repo variable. */
function tokenValue():string{
 const direct=clean(process.env.GITHUB_CLOUD_TOKEN)||clean(process.env.GH_TOKEN)||clean(process.env.GITHUB_TOKEN);
 if(direct)return direct;
 const repoVar=clean(process.env.GITHUB_CLOUD_REPO);
 return /^(github_pat_|ghp_)/.test(repoVar)?repoVar:'';
}

/** owner/repo: from GITHUB_CLOUD_REPO, else from the Git repo Vercel deployed (system env vars). */
function repoValue():string{
 const raw=clean(process.env.GITHUB_CLOUD_REPO).replace(/^https?:\/\/(www\.)?github\.com\//i,'').replace(/\.git$/,'').replace(/\/+$/,'');
 if(/^[\w.-]+\/[\w.-]+$/.test(raw))return raw;
 const owner=clean(process.env.VERCEL_GIT_REPO_OWNER),slug=clean(process.env.VERCEL_GIT_REPO_SLUG);
 return owner&&slug?`${owner}/${slug}`:raw;
}

const repo=repoValue;
const api=(path:string)=>`https://api.github.com/repos/${repo()}${path}`;
const headers=()=>({Authorization:`Bearer ${tokenValue()}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'AI-Video-Studio'});

export const cloudConfigured=()=>/^[\w.-]+\/[\w.-]+$/.test(repo())&&Boolean(tokenValue());

/** Setup diagnostics for /api/health — describes problems, never reveals values. */
export function cloudDiagnostics(){
 const rawRepo=clean(process.env.GITHUB_CLOUD_REPO),token=tokenValue(),r=repo();
 const repoState=/^[\w.-]+\/[\w.-]+$/.test(r)
  ?(rawRepo&&/^[\w.-]+\/[\w.-]+$/.test(rawRepo.replace(/^https?:\/\/(www\.)?github\.com\//i,'').replace(/\/+$/,''))?`ok (${r})`:`ok, detected automatically (${r})`)
  :!rawRepo?'missing':/^(github_pat_|ghp_)/.test(rawRepo)?'contains the token instead of owner/repo — put Elsa1172014/ai-video-studio here':'invalid — use owner/repo, e.g. Elsa1172014/ai-video-studio';
 const tokenState=!token?'missing — add GITHUB_CLOUD_TOKEN for Production':/^(github_pat_|ghp_)/.test(token)?`set (${token.slice(0,11)}…, ${token.length} chars)`.replace(/github_pat_.*?…/,'github_pat_…').replace(/ghp_.*?…/,'ghp_…'):'set, but does not look like a GitHub token (should start with github_pat_)';
 return {GITHUB_CLOUD_REPO:repoState,GITHUB_CLOUD_TOKEN:tokenState};
}
export const isCloudJob=(id:string)=>/^(scene|film)-[A-Za-z0-9-]{6,80}$/.test(id);
export const isCloudAsset=(filename:string)=>/^(scene|film)-[A-Za-z0-9-]{6,80}\.(mp4|srt|json)$/.test(filename);
export const assetUrl=(filename:string)=>`https://github.com/${repo()}/releases/download/films/${filename}`;

type CloudResult={jobId:string;status:'queued'|'processing'|'completed'|'failed';provider:string;outputUrl?:string;captionsUrl?:string|null;report?:any;message?:string};

async function githubError(r:Response,action:string){
 let detail='';try{detail=(await r.text()).slice(0,400)}catch{}
 if(r.status===401||r.status===403)return new Error(`رفض GitHub الطلب (${r.status}). تحقّق من صلاحيات GITHUB_CLOUD_TOKEN: Actions قراءة وكتابة، وContents قراءة.`);
 if(r.status===404)return new Error(`لم يجد GitHub مسار العمل السحابي في الفرع الرئيسي لمستودع ${repo()}.`);
 return new Error(`GitHub ${action} failed (${r.status}) ${detail}`);
}

async function dispatch(task:'generate'|'finish',id:string,request:unknown):Promise<CloudResult>{
 const body=JSON.stringify(request);
 if(body.length>60000)throw new Error('الطلب أكبر من حدود السحابة المجانية (مشاهد كثيرة أو نصوص طويلة).');
 const r=await fetch(api(`/actions/workflows/${WORKFLOW}/dispatches`),{method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({ref:process.env.GITHUB_CLOUD_REF||'main',inputs:{task,request_id:id,request:body}}),cache:'no-store'});
 if(!r.ok)throw await githubError(r,'to start the job');
 return {jobId:id,status:'queued',provider:task==='generate'?'cloud-hf':'cloud-render',message:task==='generate'?'في الطابور على السحابة المجانية':'في الطابور للمونتاج السينمائي على السحابة المجانية'};
}

export function cloudGenerate(input:{prompt:string;duration:number}):Promise<CloudResult>{
 // Hugging Face video Spaces generate up to ~10 s per call.
 return dispatch('generate',`scene-${crypto.randomUUID()}`,{prompt:input.prompt.slice(0,2000),duration:Math.max(1,Math.min(10,input.duration))});
}

export function cloudRender(clips:string[],finish?:FinishOptions):Promise<CloudResult>{
 return dispatch('finish',`film-${crypto.randomUUID()}`,{clips,...(finish?{finish}:{})});
}

async function readResult(id:string):Promise<any|null>{
 try{const r=await fetch(assetUrl(`${id}.json`),{cache:'no-store',redirect:'follow'});return r.ok?await r.json():null}catch{return null}
}

export async function cloudStatus(id:string):Promise<CloudResult>{
 const task=id.startsWith('scene-')?'generate':'finish';
 const provider=task==='generate'?'cloud-hf':'cloud-render';
 const r=await fetch(api(`/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=50`),{headers:headers(),cache:'no-store'});
 if(!r.ok)throw await githubError(r,'status check');
 const data=await r.json();
 const run=(data.workflow_runs||[]).find((x:any)=>x.display_title===`${task} ${id}`);
 if(!run)return {jobId:id,status:'queued',provider,message:'في انتظار جهاز تشغيل مجاني من GitHub…'};
 if(run.status!=='completed')return {jobId:id,status:run.status==='in_progress'?'processing':'queued',provider,message:task==='generate'?'جارٍ التوليد على Hugging Face (معالج مجاني)…':'جارٍ تطبيق المونتاج السينمائي…'};
 const result=await readResult(id);
 if(run.conclusion==='success'&&result?.status==='completed'){
  return {jobId:id,status:'completed',provider,outputUrl:assetUrl(`${id}.mp4`),captionsUrl:result.captions?assetUrl(`${id}.srt`):null,report:result.report,message:result.space?`وُلِّد بواسطة ${result.space}`:'الفيلم النهائي جاهز'};
 }
 const message=result?.message||`تعذّرت المهمة السحابية. التفاصيل في GitHub Actions: ${run.html_url}`;
 const quota=/quota|exceeded|GPU limit/i.test(message);
 return {jobId:id,status:'failed',provider,message:quota?'نفدت الحصة اليومية المجانية للمعالج على Hugging Face. تتجدد بعد ٢٤ ساعة من أول استخدام، ويرفعها إضافة HF_TOKEN. '+message.slice(0,300):message.slice(0,800)};
}
