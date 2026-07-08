/**
 * Curated, static "Did you know?" facts shown while an answer is generating.
 * Purely client-side, never fetched from a model (no latency, no cost, no risk
 * of fabrication). Each fact carries both languages; the caller renders
 * `fact.ar` or `fact.en` by the active UI language. Tags hold Arabic and
 * English keywords so the opening fact can match the student's question in
 * either language.
 */
export interface StudyFact {
  en: string;
  ar: string;
  tags: string[];
}

export const STUDY_FACTS: StudyFact[] = [
  {
    en: "Light from the Sun takes about 8 minutes and 20 seconds to reach Earth, so you always see the Sun as it was 8 minutes ago.",
    ar: "يستغرق ضوء الشمس نحو 8 دقائق و20 ثانية ليصل إلى الأرض، فأنت ترى الشمس دائمًا كما كانت قبل 8 دقائق.",
    tags: ["physics", "space", "light", "astronomy", "sun", "فيزياء", "فضاء", "ضوء", "فلك", "شمس"],
  },
  {
    en: "Honey never spoils. Archaeologists have found 3,000-year-old honey in Egyptian tombs that was still perfectly edible.",
    ar: "العسل لا يفسد أبدًا. عثر علماء الآثار على عسل عمره 3000 عام في مقابر مصرية وما زال صالحًا للأكل.",
    tags: ["biology", "chemistry", "food", "أحياء", "كيمياء", "عسل", "طعام"],
  },
  {
    en: "A bolt of lightning is about five times hotter than the surface of the Sun: roughly 30,000 degrees Celsius.",
    ar: "حرارة البرق تفوق حرارة سطح الشمس بنحو خمس مرات: حوالي 30,000 درجة مئوية.",
    tags: ["physics", "heat", "weather", "lightning", "فيزياء", "حرارة", "برق", "طقس"],
  },
  {
    en: "Your body has around 37 trillion cells, and millions of them are replaced every single second.",
    ar: "جسمك يحوي نحو 37 تريليون خلية، وملايين منها تتجدد في كل ثانية.",
    tags: ["biology", "cell", "human body", "أحياء", "خلية", "جسم الإنسان"],
  },
  {
    en: "Water is one of the few substances that expands when it freezes, which is exactly why ice floats.",
    ar: "الماء من المواد القليلة التي تتمدد عندما تتجمد، ولهذا السبب بالضبط يطفو الجليد.",
    tags: ["chemistry", "physics", "water", "ice", "density", "states of matter", "كيمياء", "ماء", "جليد", "كثافة", "حالات المادة"],
  },
  {
    en: "There are more possible ways to arrange a deck of 52 cards than there are atoms on Earth.",
    ar: "عدد الطرق الممكنة لترتيب 52 ورقة لعب أكبر من عدد الذرات على الأرض.",
    tags: ["mathematics", "probability", "permutations", "رياضيات", "احتمالات", "تباديل"],
  },
  {
    en: "Sound travels about 4 times faster in water than in air, and even faster through solids like steel.",
    ar: "ينتقل الصوت في الماء أسرع بنحو 4 مرات منه في الهواء، وأسرع من ذلك في المواد الصلبة كالفولاذ.",
    tags: ["physics", "sound", "waves", "فيزياء", "صوت", "موجات"],
  },
  {
    en: "Photosynthesis is the reason almost all the oxygen you breathe exists: plants and algae have been making it for billions of years.",
    ar: "البناء الضوئي هو سبب وجود معظم الأكسجين الذي تتنفسه: النباتات والطحالب تصنعه منذ مليارات السنين.",
    tags: ["biology", "photosynthesis", "plants", "oxygen", "أحياء", "بناء ضوئي", "نبات", "أكسجين"],
  },
  {
    en: "Octopuses have three hearts and blue blood: the copper in their blood carries oxygen instead of iron.",
    ar: "للأخطبوط ثلاثة قلوب ودم أزرق: النحاس في دمه هو الذي يحمل الأكسجين بدلًا من الحديد.",
    tags: ["biology", "animals", "blood", "أحياء", "حيوان", "دم", "أخطبوط"],
  },
  {
    en: "The human brain runs on about 20 watts of power (less than a typical light bulb), yet it does more than any supercomputer.",
    ar: "يعمل دماغك بطاقة نحو 20 واط فقط (أقل من مصباح عادي)، ومع ذلك ينجز أكثر من أي حاسوب عملاق.",
    tags: ["biology", "human body", "physics", "energy", "brain", "أحياء", "دماغ", "طاقة", "جسم الإنسان"],
  },
  {
    en: "Pi has been calculated to over 100 trillion digits, but NASA uses only about 15 for its most precise calculations.",
    ar: "حُسبت قيمة باي إلى أكثر من 100 تريليون رقم، لكن ناسا لا تستخدم سوى نحو 15 رقمًا في أدق حساباتها.",
    tags: ["mathematics", "pi", "geometry", "space", "رياضيات", "باي", "هندسة", "فضاء"],
  },
  {
    en: "Diamond and graphite (pencil lead) are both made of pure carbon: the only difference is how the atoms are arranged.",
    ar: "الألماس والجرافيت (سن قلم الرصاص) كلاهما كربون نقي: الفرق الوحيد هو طريقة ترتيب الذرات.",
    tags: ["chemistry", "carbon", "bonding", "materials", "كيمياء", "كربون", "روابط", "ألماس"],
  },
  {
    en: "Newton's first law is why you lurch forward when a moving bus suddenly brakes: your body wants to keep moving (inertia).",
    ar: "قانون نيوتن الأول هو سبب اندفاعك إلى الأمام عندما تتوقف الحافلة فجأة: جسمك يريد أن يواصل الحركة (القصور الذاتي).",
    tags: ["physics", "newton", "force", "motion", "inertia", "فيزياء", "نيوتن", "قوة", "حركة", "قصور"],
  },
  {
    en: "Iron is forged inside stars. The iron in your blood was literally made in a star that exploded long ago.",
    ar: "الحديد يتكوّن داخل النجوم. الحديد الموجود في دمك صُنع فعلًا في نجم انفجر منذ زمن بعيد.",
    tags: ["chemistry", "physics", "space", "elements", "iron", "stars", "كيمياء", "فضاء", "عناصر", "حديد", "نجوم"],
  },
  {
    en: "The speed of light is the universe's speed limit: about 299,792 kilometres every second.",
    ar: "سرعة الضوء هي الحد الأقصى للسرعة في الكون: نحو 299,792 كيلومترًا في كل ثانية.",
    tags: ["physics", "light", "space", "constants", "speed", "فيزياء", "ضوء", "فضاء", "سرعة"],
  },
];

export const FALLBACK_STUDY_FACT: StudyFact = {
  en: "Every expert was once a beginner: the fact that a topic feels hard right now is exactly how learning starts.",
  ar: "كل خبير كان مبتدئًا يومًا ما: شعورك بأن الموضوع صعب الآن هو بالضبط الطريقة التي يبدأ بها التعلّم.",
  tags: [],
};

/**
 * Fold a string for matching in either language: lowercase Latin, and for
 * Arabic strip diacritics and tatweel and normalise every alef variant to the
 * bare alef, so a student's "أكسجين" matches a tag written as "اكسجين".
 */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u0640\u064B-\u065F\u0670]/g, "") // tatweel + harakat diacritics
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627"); // alef variants to bare alef
}

/** Pick a starting fact relevant to the student's question (by keyword/tag match). */
export function pickFirstFactIndex(seedMessage: string): number {
  const m = normalizeForMatch(seedMessage || "");
  if (!m.trim()) return Math.floor(STUDY_FACTS.length / 2);
  let bestIdx = -1;
  let bestScore = 0;
  STUDY_FACTS.forEach((f, i) => {
    const score = f.tags.reduce((s, tag) => (m.includes(normalizeForMatch(tag)) ? s + 1 : s), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  });
  if (bestIdx >= 0) return bestIdx;
  // No tag match: deterministic-ish pick from the message so it isn't always the same.
  return m.length % STUDY_FACTS.length;
}
