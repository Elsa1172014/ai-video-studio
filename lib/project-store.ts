export type Character={id:string;name:string;role?:string;appearance:string;wardrobe?:string;voice?:string;personality?:string;relationships?:string;referenceImageUrl?:string};
export type EpisodeMemory={episodeNumber:number;summary:string;continuityNotes?:string};
export type Scene={id:string;title:string;prompt:string;sourceText?:string;referenceImageUrl?:string;duration:number;status:'planned'|'generating'|'ready'};
export type VideoProject={id:string;title:string;prompt:string;mode?:'education'|'series';seriesTitle?:string;episodeNumber?:number;minutes:number;totalSeconds?:number;sceneDuration?:number;createdAt:string;characters?:Character[];episodeMemory?:EpisodeMemory[];scenes:Scene[]};
const KEY='ai-video-studio-projects-v1';
export function loadProjects():VideoProject[]{if(typeof window==='undefined')return[];try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}}
export function saveProject(p:VideoProject){const all=loadProjects().filter(x=>x.id!==p.id);localStorage.setItem(KEY,JSON.stringify([p,...all]));}
export function removeProject(id:string){localStorage.setItem(KEY,JSON.stringify(loadProjects().filter(x=>x.id!==id)));}
export function loadSeriesContext(seriesTitle:string){return loadProjects().filter(p=>p.mode==='series'&&p.seriesTitle===seriesTitle).sort((a,b)=>(a.episodeNumber||0)-(b.episodeNumber||0));}