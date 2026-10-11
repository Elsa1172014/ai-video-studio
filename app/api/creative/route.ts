import {z} from 'zod';
import {route,body} from '@/lib/server/http';
import {Direction} from '@/lib/server/schemas';
import {improveDirection} from '@/lib/server/director';
export const maxDuration=180;
export const POST=route(async(req:Request)=>{const x=await body(req,z.object({direction:Direction,seconds:z.number().int().min(5).max(1800)}));return improveDirection(x.direction,x.seconds);});
