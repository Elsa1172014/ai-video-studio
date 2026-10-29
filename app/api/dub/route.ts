import {NextResponse} from 'next/server';

export const dynamic='force-dynamic';

// Dubbing (transcribe → translate → TTS → timing) is not wired to the worker yet.
// Return an explicit 501 instead of an empty handler so the UI can explain it.
export async function POST(){
 return NextResponse.json({status:'failed',error:'Dubbing is not connected yet. It needs WHISPER_COMMAND and TTS_GENERATE_COMMAND on the worker plus a translation step.'},{status:501});
}
