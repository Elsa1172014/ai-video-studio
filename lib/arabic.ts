// Display translations only: API values and saved project data stay unchanged.
const labels: Record<string, string> = {
  pending: 'لم يبدأ', queued: 'في الانتظار', processing: 'جارٍ التنفيذ', completed: 'مكتمل',
  failed: 'تعذّر التنفيذ', cancelled: 'ملغى', draft: 'مسودة', storyboard: 'مخطط المشاهد جاهز',
  generating: 'جارٍ التوليد', rendering: 'جارٍ إخراج الفيديو',
  opening: 'البداية', development: 'تطور الأحداث', climax: 'الذروة', resolution: 'النهاية',
  'teaching beat': 'فكرة تعليمية', llm: 'الذكاء الاصطناعي', deterministic: 'قواعد ثابتة', manual: 'تحرير يدوي',
};
export const arabicLabel = (value?: string) => value ? labels[value] || value : '…';

export function arabicNotice(value?: string): string {
  if (!value) return '';
  if (labels[value]) return labels[value];
  if (/The source is short for this length/.test(value)) return 'النص قصير بالنسبة إلى المدة المطلوبة؛ أُضيف وقت للمشاهد دون إضافة معلومات.';
  const long = value.match(/The text needs about (\d+) min.*target was ([\d.]+) min/);
  if (long) return `يحتاج النص نحو ${long[1]} دقيقة للتعليق الصوتي، والمدة المطلوبة ${long[2]} دقيقة. لم يُحذف أي جزء من النص.`;
  const short = value.match(/fills about ([\d.]+) of the ([\d.]+) min target/);
  if (short) return `يغطي النص نحو ${short[1]} دقيقة من المدة المطلوبة (${short[2]} دقيقة). أضف محتوى أو اختر مدة أقصر.`;
  if (/AI director unavailable/.test(value)) return 'تعذّر الوصول إلى المخرج الذكي؛ استُخدم المخطط القائم على قواعد ثابتة.';
  const planned = value.match(/Planned ([\d.]+) min for a ([\d.]+) min target/);
  if (planned) return `مدة المشاهد المخططة ${planned[1]} دقيقة مقابل ${planned[2]} دقيقة مطلوبة.`;
  if (/has no voice assigned/.test(value)) return 'استُخدم صوت الراوي لأحد المتحدثين لعدم تحديد صوته.';
  if (/not found/i.test(value)) return 'لم يُعثر على العنصر المطلوب.';
  if (/not configured|configuration|missing.*key/i.test(value)) return 'إعدادات خدمة الإنتاج غير مكتملة.';
  if (/authentication|unauthorized|401|403/i.test(value)) return 'تعذّر التحقق من صلاحية الاتصال بخدمة الإنتاج.';
  if (/timeout|timed out|unreachable|fetch failed|failed to fetch|temporarily|502|503|504/i.test(value)) return 'تعذّر الاتصال بالخدمة مؤقتًا؛ أعد المحاولة بعد قليل.';
  if (/Invalid request|Invalid id|out of range/i.test(value)) return 'راجع البيانات المدخلة والمدة المطلوبة ثم أعد المحاولة.';
  if (/Internal server error/i.test(value)) return 'حدث خطأ في الخادم أثناء تنفيذ الطلب.';
  if (/Generate all clips|Nothing to render/i.test(value)) return 'أنشئ مخطط المشاهد وأكمل توليد اللقطات قبل إخراج الفيديو.';
  if (/no narration or dialogue/i.test(value)) return 'أضف تعليقًا صوتيًا أو حوارًا إلى المشهد أولًا.';
  if (/Job is still running/i.test(value)) return 'المهمة ما زالت قيد التنفيذ.';
  if (/No usable text/.test(value)) return 'أدخل نصًا صالحًا لإعداد المشاهد.';
  if (/local|durable storage/i.test(value)) return 'الحفظ الحالي مؤقت؛ يلزم تفعيل الحفظ الدائم للاحتفاظ بالوسائط.';
  // Preserve Arabic messages; do not expose raw service errors as English UI copy.
  return /[\u0600-\u06ff]/.test(value) ? value : 'تعذّر إكمال العملية. حاول مرة أخرى أو راجع إعدادات الخدمة.';
}

export function arabicCount(n: number, unit: 'scene' | 'shot' | 'minute' | 'second'): string {
  const forms = {
    scene: ['مشهد واحد', 'مشهدان', 'مشاهد', 'مشهدًا'],
    shot: ['لقطة واحدة', 'لقطتان', 'لقطات', 'لقطة'],
    minute: ['دقيقة واحدة', 'دقيقتان', 'دقائق', 'دقيقة'],
    second: ['ثانية واحدة', 'ثانيتان', 'ثوانٍ', 'ثانية'],
  }[unit];
  return n === 1 ? forms[0] : n === 2 ? forms[1] : `${n} ${n >= 3 && n <= 10 ? forms[2] : forms[3]}`;
}
