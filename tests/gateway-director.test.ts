import {afterEach,describe,it,expect,vi} from 'vitest';
import * as z from 'zod/v4';
import {gatewayDirector} from '@/lib/server/gateway-director';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('gateway director',()=>{
 it('authenticates with deployment identity and validates the generated structure',async()=>{
  vi.stubEnv('AI_GATEWAY_API_KEY','');vi.stubEnv('VERCEL_OIDC_TOKEN','test-identity');
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"idea":"الإنسان محور المدينة"}'}}]})));
  vi.stubGlobal('fetch',request);
  expect(await gatewayDirector(z.object({idea:z.string()}),'summarize','source')).toEqual({idea:'الإنسان محور المدينة'});
  expect(request.mock.calls[0][1].headers.Authorization).toBe('Bearer test-identity');
 });
 it('does not accept truncated output or expose upstream secrets in errors',async()=>{
  vi.stubEnv('VERCEL_OIDC_TOKEN','test-identity');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('private provider diagnostic',{status:403})));
  await expect(gatewayDirector(z.object({idea:z.string()}),'','')).rejects.toThrow(/تفعيل الحساب/);
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{"idea":"unfinished"}'}}]}))));
  await expect(gatewayDirector(z.object({idea:z.string()}),'','')).rejects.toThrow(/لم يكتمل/);
 });
});
