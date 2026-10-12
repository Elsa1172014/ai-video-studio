import {describe,expect,it} from 'vitest';
import {POST} from '@/app/api/script/route';

const call=(body:unknown)=>POST(new Request('http://x/api/script',{method:'POST',body:JSON.stringify(body)}));

describe('POST /api/script',()=>{
  it('rejects a too-short prompt with 400',async()=>{
    const r=await call({prompt:'a',minutes:1});
    expect(r.status).toBe(400);
  });
  it('rejects durations outside 0.5–20 minutes',async()=>{
    expect((await call({prompt:'valid prompt',minutes:0.1})).status).toBe(400);
    expect((await call({prompt:'valid prompt',minutes:21})).status).toBe(400);
  });
  it('education mode: scene durations sum exactly to the requested total',async()=>{
    const r=await call({prompt:'First idea. Second idea. Third idea.',minutes:2,mode:'education'});
    const d=await r.json();
    expect(r.status).toBe(200);
    expect(d.totalSeconds).toBe(120);
    expect(d.scenes.reduce((n:number,s:{duration:number})=>n+s.duration,0)).toBe(120);
    expect(d.scenes.every((s:{prompt:string})=>s.prompt.includes('EDUCATIONAL MODE'))).toBe(true);
  });
  it('series mode: injects character bible and episode memory',async()=>{
    const r=await call({prompt:'Omar finds a map.',minutes:1,mode:'series',seriesTitle:'S',episodeTitle:'E2',episodeMemory:'Ep1: Omar met Mariam',characters:[{name:'Omar',description:'12-year-old boy'}]});
    const d=await r.json();
    expect(d.scenes[0].prompt).toContain('CHARACTER BIBLE: Omar: 12-year-old boy');
    expect(d.scenes[0].prompt).toContain('PREVIOUS EPISODE MEMORY: Ep1: Omar met Mariam');
    expect(d.scenes.reduce((n:number,s:{duration:number})=>n+s.duration,0)).toBe(60);
  });
  it('splits Arabic sentences on ؟ and ؛',async()=>{
    const d=await (await call({prompt:'ما هو الفعل؟ الفعل كلمة تدل على حدث؛ ويقترن بزمن.',minutes:5})).json();
    const sources=new Set(d.scenes.map((s:{sourceText:string})=>s.sourceText));
    expect(sources.size).toBeGreaterThanOrEqual(3);
  });
  it('scene ids are unique',async()=>{
    const d=await (await call({prompt:'One. Two.',minutes:5})).json();
    expect(new Set(d.scenes.map((s:{id:string})=>s.id)).size).toBe(d.scenes.length);
  });
});
