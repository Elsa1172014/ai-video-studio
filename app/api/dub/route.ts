import {NextResponse} from 'next/server';

export const dynamic='force-dynamic';

// Dubbing (transcribe → translate → TTS → timing) is not wired to the worker yet.
// Return an explicit 501 instead of an empty handler so the UI can explain it.
export async function POST(){
 return NextResponse.json({status:'failed',error:'الدبلجة غير متاحة بعد، فهي تحتاج خادماً بمحرّكي التفريغ والصوت.'},{status:501});
}
