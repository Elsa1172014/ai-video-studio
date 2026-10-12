import { NextResponse } from 'next/server';
import { z } from 'zod';
import { refineWithLlm } from '@/lib/llm';
import { toSeconds } from '@/lib/planner';
import { analyzeStory, buildScenes } from '@/lib/story';

const S = z.object({
  text: z.string().trim().min(10, 'Write at least a sentence of story').max(20000),
  title: z.string().max(80).optional(),
  language: z.enum(['ar', 'en']).optional(),
  minutes: z.number().min(0).max(30).default(0),
  seconds: z.number().min(0).max(59).default(0),
});

export async function POST(req: Request) {
  try {
    const x = S.parse(await req.json());
    const totalSeconds = toSeconds(x.minutes, x.seconds);
    if (totalSeconds < 1) return NextResponse.json({ error: 'Choose a video length of at least 1 second' }, { status: 400 });
    const bible = await refineWithLlm(x.text, analyzeStory(x.text, { title: x.title, language: x.language }));
    return NextResponse.json({ bible, scenes: buildScenes(bible, totalSeconds), totalSeconds });
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues.map((i) => i.message).join('; ') : e instanceof Error ? e.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
