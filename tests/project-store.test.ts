import {beforeEach,describe,expect,it,vi} from 'vitest';
import {loadProjects,removeProject,saveProject,VideoProject} from '@/lib/project-store';

const mk=(id:string):VideoProject=>({id,title:id,prompt:'p',minutes:1,createdAt:'2026-01-01',scenes:[]});

describe('project-store',()=>{
  beforeEach(()=>{
    const m=new Map<string,string>();
    vi.stubGlobal('window',{});
    vi.stubGlobal('localStorage',{getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>void m.set(k,v),removeItem:(k:string)=>void m.delete(k)});
  });
  it('returns [] on the server (no window)',()=>{vi.unstubAllGlobals();expect(loadProjects()).toEqual([]);});
  it('saves newest first and de-duplicates by id',()=>{
    saveProject(mk('a'));saveProject(mk('b'));saveProject({...mk('a'),title:'A2'});
    expect(loadProjects().map(p=>p.id)).toEqual(['a','b']);expect(loadProjects()[0].title).toBe('A2');
  });
  it('removes a project',()=>{saveProject(mk('a'));saveProject(mk('b'));removeProject('a');expect(loadProjects().map(p=>p.id)).toEqual(['b']);});
  it('survives corrupted storage',()=>{localStorage.setItem('ai-video-studio-projects-v1','{bad');expect(loadProjects()).toEqual([]);});
});
