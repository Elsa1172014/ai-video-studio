export type ProviderId = 'ltx'|'wan'|'avatar'|'lipsync';
export type ProviderInfo = {id:ProviderId;label:string;kind:'scene'|'character';description:string;imageConditioning:boolean};

/** Generation backends exposed by the GPU worker (worker/adapters). */
export const PROVIDERS: ProviderInfo[] = [
  {id:'ltx', label:'LTX Video', kind:'scene', description:'Fast text/image-to-video. Supports character reference conditioning.', imageConditioning:true},
  {id:'wan', label:'Wan 2.2', kind:'scene', description:'High-fidelity open model. Needs WAN_GENERATE_COMMAND on the worker.', imageConditioning:true},
  {id:'avatar', label:'Talking avatar', kind:'character', description:'LivePortrait / EchoMimic. Needs AVATAR_GENERATE_COMMAND.', imageConditioning:true},
  {id:'lipsync', label:'Lip sync', kind:'character', description:'MuseTalk. Needs LIPSYNC_GENERATE_COMMAND.', imageConditioning:true},
];

export const PROVIDER_IDS = PROVIDERS.map(p => p.id) as [ProviderId, ...ProviderId[]];

/** Finishing tools installed on the worker image (worker/capabilities.py). */
export const FINISHING_TOOLS = [
  {id:'kinocut', label:'Kinocut', role:'Transitions, colour grade, vignette, film grain, fades, audio mix'},
  {id:'hyperframes', label:'HyperFrames (HeyGen)', role:'Animated Arabic title and end cards'},
  {id:'ffmpeg', label:'FFmpeg + libass', role:'Arabic captions with correct RTL shaping, delivery encode'},
] as const;
