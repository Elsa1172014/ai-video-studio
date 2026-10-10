import type {AspectRatio} from '@/lib/types';

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

/** Longest single clip the video model generates; scenes longer than this are split into shots. */
export const maxShotSeconds = () => num(process.env.MAX_SHOT_SECONDS, 10);
export const videoProvider = () => process.env.VIDEO_PROVIDER || 'ltx';
export const ttsProvider = () => process.env.TTS_PROVIDER || 'tts';
export const defaultVoice = () => process.env.DEFAULT_VOICE_ID || 'default';

export const jobTimeoutMs = (type: 'video' | 'audio' | 'render') =>
  num(process.env[`JOB_TIMEOUT_${type.toUpperCase()}_MINUTES`], type === 'audio' ? 10 : 30) * 60_000;

/** Generation size per aspect ratio (multiples of 32 for LTX) and final render size. */
export function frame(aspect: AspectRatio) {
  if (aspect === '9:16') return {width: 448, height: 768, renderWidth: 720, renderHeight: 1280};
  if (aspect === '1:1') return {width: 640, height: 640, renderWidth: 1080, renderHeight: 1080};
  return {width: 768, height: 448, renderWidth: 1280, renderHeight: 720};
}
