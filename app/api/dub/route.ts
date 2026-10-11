import {NextResponse} from 'next/server';

export const dynamic = 'force-dynamic';

// Dubbing (transcribe -> translate -> TTS -> mux) is not implemented on the worker yet.
// Answer honestly instead of proxying to a route that does not exist.
export async function POST() {
  return NextResponse.json({status: 'not_implemented', error: 'AI dubbing is not available yet. Narration and dialogue voices are generated per scene in the Educational and Series studios.'}, {status: 501});
}