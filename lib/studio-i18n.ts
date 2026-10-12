import type { Lang } from './story';

const dict = {
  ar: {
    brand: 'استوديو الحكاية', tagline: 'من النص إلى فيلم، بالمدة التي تحددها',
    step1: 'اكتب', step2: 'الشخصيات', step3: 'القصة المصوّرة', step4: 'أنتج',
    storyLabel: 'قصتك أو نصك', storyPh: 'اكتب القصة هنا… سيستخرج الاستوديو الشخصيات والمكان والرسالة تلقائيًا.',
    duration: 'مدة الفيديو', minutes: 'دقيقة', seconds: 'ثانية', totalSeconds: 'إجمالي بالثواني', exact: 'المدة النهائية ستكون هذه بالضبط', scenesAbout: 'مشهد تقريبًا',
    quick: 'سريع', analyze: 'حلّل القصة', analyzing: 'جارٍ التحليل…', needStory: 'اكتب جملة واحدة على الأقل', needTime: 'حدد مدة لا تقل عن ثانية',
    detected: 'ما فهمه الاستوديو', message: 'الرسالة', tone: 'الأجواء', setting: 'المكان', title: 'العنوان',
    byRules: 'تحليل بالقواعد', byLlm: 'تحليل بنموذج لغوي', edit: 'عدّل أي شيء، وسيُعاد بناء المشاهد فورًا.',
    cast: 'الشخصيات', castHint: 'ثبّت الشخصية بإضافة رابط صورة مرجعية؛ تُستخدم عند كل قطع جديد.', name: 'الاسم', desc: 'الوصف المرئي', refImage: 'رابط صورة مرجعية',
    addCharacter: 'إضافة شخصية', remove: 'حذف', noCast: 'لم تُكتشف شخصيات. أضفها يدويًا لتثبيت مظهرها.',
    avatar: 'أفاتار ناطق', avatarSoon: 'قريبًا — المرحلة 4',
    board: 'القصة المصوّرة', chain: 'يتابع المشهد السابق', fresh: 'قطع جديد', total: 'المجموع',
    phase_opening: 'افتتاح', phase_development: 'تطور', phase_climax: 'ذروة', phase_ending: 'خاتمة',
    produce: 'ابدأ الإنتاج', resume: 'استئناف', stop: 'إيقاف', retryJoin: 'أعد الدمج', reset: 'ابدأ من جديد', download: 'تنزيل الفيديو',
    idle: 'جاهز للبدء', running: 'جارٍ إنتاج المشهد', joining: 'جارٍ دمج المشاهد وضبط المدة', done: 'اكتمل الفيديو', failed: 'توقف الإنتاج', stopped: 'تم الإيقاف',
    sceneOf: 'المشهد {n} من {t}', produced: 'تم إنتاجه', remaining: 'المتبقي', elapsed: 'المنقضي', eta: 'الوقت المتبقي تقريبًا', calculating: 'يُحسب بعد أول مشهد',
    status_queued: 'بانتظار الدور', status_generating: 'قيد التوليد', status_done: 'جاهز', status_failed: 'فشل',
    gpuNote: 'يتطلب خادم GPU متصلًا (GPU_API_URL أو Runpod). التقدم يعكس المشاهد المنتَجة فعلًا.',
    finalVideo: 'الفيديو النهائي', selected: 'المشهد المحدد', prompt: 'وصف المشهد للنموذج',
    langSwitch: 'English', old: 'الاستوديو الكلاسيكي',
  },
  en: {
    brand: 'Story Studio', tagline: 'From text to film, at the length you choose',
    step1: 'Write', step2: 'Cast', step3: 'Storyboard', step4: 'Produce',
    storyLabel: 'Your story or script', storyPh: 'Write the story here… the studio finds characters, setting and message for you.',
    duration: 'Video length', minutes: 'min', seconds: 'sec', totalSeconds: 'total seconds', exact: 'The final video will be exactly this long', scenesAbout: 'scenes approx.',
    quick: 'Quick', analyze: 'Analyse story', analyzing: 'Analysing…', needStory: 'Write at least one sentence', needTime: 'Choose a length of at least 1 second',
    detected: 'What the studio understood', message: 'Message', tone: 'Mood', setting: 'Setting', title: 'Title',
    byRules: 'Rule-based analysis', byLlm: 'Language-model analysis', edit: 'Edit anything; scenes are rebuilt instantly.',
    cast: 'Characters', castHint: 'Lock a character’s look with a reference image URL; it anchors every new cut.', name: 'Name', desc: 'Visual description', refImage: 'Reference image URL',
    addCharacter: 'Add character', remove: 'Remove', noCast: 'No characters detected. Add them to lock their look.',
    avatar: 'Talking avatar', avatarSoon: 'Coming in phase 4',
    board: 'Storyboard', chain: 'Continues previous scene', fresh: 'New cut', total: 'Total',
    phase_opening: 'Opening', phase_development: 'Development', phase_climax: 'Climax', phase_ending: 'Ending',
    produce: 'Start production', resume: 'Resume', stop: 'Stop', retryJoin: 'Retry joining', reset: 'Start over', download: 'Download video',
    idle: 'Ready to start', running: 'Producing scene', joining: 'Joining scenes and fixing the length', done: 'Video complete', failed: 'Production stopped', stopped: 'Stopped',
    sceneOf: 'Scene {n} of {t}', produced: 'Produced', remaining: 'Remaining', elapsed: 'Elapsed', eta: 'Time left (approx.)', calculating: 'Calculated after the first scene',
    status_queued: 'Waiting', status_generating: 'Generating', status_done: 'Ready', status_failed: 'Failed',
    gpuNote: 'Needs a connected GPU server (GPU_API_URL or Runpod). Progress reflects scenes actually produced.',
    finalVideo: 'Final video', selected: 'Selected scene', prompt: 'Scene prompt sent to the model',
    langSwitch: 'العربية', old: 'Classic studio',
  },
} as const;

export type StudioStrings = Record<keyof (typeof dict)['en'], string>;
export const tr = (lang: Lang): StudioStrings => dict[lang];
export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
