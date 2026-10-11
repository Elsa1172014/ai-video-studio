'use client';

export default function Timeline() {
  return (
    <div className="mt-6">
      <div className="mb-2 flex justify-between text-xs text-slate-500">
        <span>00:00</span>
        <span>الخط الزمني</span>
        <span>النهاية</span>
      </div>
      <div className="space-y-2">
        <div className="flex h-14 gap-1 rounded-xl bg-black/25 p-2">
          {[1,2,3,4,5].map(scene => (
            <div key={scene} className="flex-1 rounded-lg border border-purple-500/30 bg-purple-500/10 p-2 text-xs">
              المشهد {scene}
            </div>
          ))}
        </div>
        <div className="h-10 rounded-xl border border-white/10 bg-white/5 p-2 text-xs text-slate-400">مسار الصوت والموسيقى</div>
        <div className="h-10 rounded-xl border border-white/10 bg-white/5 p-2 text-xs text-slate-400">مسار النص المصاحب</div>
      </div>
    </div>
  );
}
