'use client';
import { clampTotal, formatClock, MAX_TOTAL_SECONDS, SCENE_TARGET } from '@/lib/planner';
import type { StudioStrings } from '@/lib/studio-i18n';

const QUICK = [15, 30, 60, 120, 300, 600];

/** Length picker in seconds: precise minute/second fields, a slider for quick drags, and presets. The result is the exact final length. */
export function TimeDial({ total, onChange, s }: { total: number; onChange: (seconds: number) => void; s: StudioStrings }) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
  return (
    <fieldset className="st-dial">
      <legend>{s.duration}</legend>
      <div className="st-dial-read" aria-live="polite">
        <output className="st-clock">{formatClock(total)}</output>
        <span className="st-dial-note">{total ? `${s.exact} · ≈ ${Math.max(1, Math.round(total / SCENE_TARGET))} ${s.scenesAbout}` : s.needTime}</span>
      </div>
      <div className="st-dial-fields">
        <label><input type="number" min={0} max={30} inputMode="numeric" value={minutes} onChange={(e) => onChange(clampTotal(num(e.target.value) * 60 + seconds))} /><span>{s.minutes}</span></label>
        <label><input type="number" min={0} inputMode="numeric" value={seconds} onChange={(e) => onChange(clampTotal(minutes * 60 + num(e.target.value)))} /><span>{s.seconds}</span></label>
        <label className="is-total"><input type="number" min={0} max={MAX_TOTAL_SECONDS} inputMode="numeric" value={total} onChange={(e) => onChange(clampTotal(num(e.target.value)))} aria-label={s.totalSeconds} /><span>{s.totalSeconds}</span></label>
      </div>
      <input className="st-slider" type="range" min={0} max={MAX_TOTAL_SECONDS} step={1} value={total} onChange={(e) => onChange(clampTotal(Number(e.target.value)))} aria-label={s.duration} style={{ ['--p' as string]: `${(total / MAX_TOTAL_SECONDS) * 100}%` }} />
      <div className="st-chips" aria-label={s.quick}>
        {QUICK.map((q) => (
          <button type="button" key={q} className={total === q ? 'is-on' : ''} onClick={() => onChange(q)}>{formatClock(q)}</button>
        ))}
      </div>
    </fieldset>
  );
}
