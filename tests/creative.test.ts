import {describe,it,expect} from 'vitest';
import {suggestDirection,directedBoard,allocateSeconds} from '@/lib/creative';
import {Direction} from '@/lib/server/schemas';
import {attachShots} from '@/lib/prompts';
describe('producer direction',()=>{
 it('preserves every source paragraph and its numeric evidence in editable suggestions',()=>{
  const text='الإنسان أساس تخطيط المدن.\nيصل الطفل إلى المدرسة خلال 10 دقائق.\nتقع المرافق على مسافة 500-600 متر.';
  const d=suggestDirection(text,60);
  expect(d.beats).toHaveLength(3);expect(d.beats.map(b=>b.sourceText).join('\n')).toBe(text);
  expect(d.beats[2].evidence.join(' ')).toContain('500-600');expect(d.beats.reduce((n,b)=>n+b.duration,0)).toBe(60);
  expect(Direction.parse(d).method).toBe('motion');expect(directedBoard(d,60).scenes).toHaveLength(3);
 });
 it('rejects a squeezed paragraph instead of silently dropping ideas',()=>{
  const d=suggestDirection('هذه فكرة مهمة ودليلها لا يجوز حذفه. '.repeat(20),5);
  expect(()=>directedBoard(d,5)).toThrow(/طويل/);
  expect(()=>allocateSeconds([1,1,1],10)).toThrow(/15/);
 });
 it('sends the assigned speaker, image and role into educational shots',()=>{
  const d=suggestDirection('يشرح المهندس كيف تحسن المساحات الخضراء الحياة.',20);
  d.characters=[{id:crypto.randomUUID(),seriesId:'education',name:'المهندس',role:'رئيسة',appearance:'قميص أبيض',referenceImage:{url:'https://example.org/portrait.jpg',durable:true},voice:{provider:'tts',voiceId:'ar-AE-HamdanNeural'},locked:false,createdAt:'',updatedAt:''}];
  d.beats[0].speakerId=d.characters[0].id;d.beats[0].characterIds=[d.characters[0].id];
  const board=attachShots(directedBoard(d,20),{mode:'education',aspectRatio:'16:9',characters:d.characters,maxShotSeconds:5});
  expect(board.scenes[0].dialogue[0].speaker).toBe('المهندس');expect(board.scenes[0].referenceImageUrl).toBe(d.characters[0].referenceImage!.url);expect(board.scenes[0].shots[0].prompt).toContain('قميص أبيض');
 });
});
