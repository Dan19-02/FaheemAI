/**
 * Landing copy, in both languages.
 *
 * The marketing landing is Arabic-first, but a header toggle can switch the
 * whole page to English. This module is the single source of truth for every
 * chrome / marketing string on the landing, in `ar` and `en`. Section
 * components read the active copy via `useLandingCopy()`, which follows the
 * app-wide `LocaleContext` so the choice is shared with the authenticated app.
 *
 * NOT translated here (on purpose): the two REAL captured answer cards in the
 * Proof and Re-explain sections. Those are genuine, unedited Arabic product
 * output — the page's core "no mockups" proof — so they stay Arabic (pinned
 * dir="rtl") in both languages, and the Reach section already shows the same
 * idea answered in Arabic AND English side by side. Only the narration around
 * them is translated.
 */
import { useLocale } from "../i18n/LocaleContext";
import type { Dir, Lang } from "../i18n/LocaleContext";

export interface LandingCopy {
  header: {
    homeAria: string;
    navAria: string;
    proof: string;
    reach: string;
    login: string;
    startFree: string;
    switchToEnglish: string;
    switchToArabic: string;
  };
  hero: {
    ariaLabel: string;
    chip: string;
    titleLead: string; // "A patient teacher,"
    titleAccent: string; // red — "in your language"
    titleMid: string; // ", that knows your Bahrain syllabus"
    titleUnderlined: string; // teal — "exactly"
    titleTail: string; // "."
    subtitle: string;
    ctaPrimary: string;
    ctaSecondary: string;
    freeNote: string; // "Free during the Bahrain trial · no card"
    sliverNote: string;
  };
  proof: {
    ariaLabel: string;
    kicker: string;
    title: string;
    para: string;
    youLabel: string;
    faheemLabel: string;
    chipStillUnclear: string;
    chipDeepCheck: string;
    chipSaveLines: string;
    chipListen: string;
    captureNote: string;
  };
  reexplain: {
    ariaLabel: string;
    title: string;
    para1: string;
    chip: string;
    para2: string;
    youLabel: string;
    faheemLabel: string;
    endsWithQuestion: string;
    shape: string;
    steps: { title: string; body: string }[];
  };
  reach: {
    ariaLabel: string;
    title: string;
    para: string;
    twoAnswersNote: string;
    boardsLabel: string;
    boards: string[];
    gradesLine: string;
    ways: { title: string; body: string }[];
  };
  capabilities: {
    ariaLabel: string;
    kicker: string;
    title: string;
    subtitle: string;
    cards: { title: string; body: string }[];
  };
  cta: {
    ariaLabel: string;
    kicker: string;
    title: string;
    para: string;
    button: string;
    buttonNote: string;
    included: string[];
    parentNote: string;
  };
  footer: {
    tagline: string;
    navAria: string;
    proof: string;
    reach: string;
    support: string;
    login: string;
    // copyright is assembled with the support email in the component
    copyrightLead: string; // "© 2026 Faheem · a Clarify.AI product · for any question, reach us at "
    copyrightTail: string; // "."
  };
}

const AR: LandingCopy = {
  header: {
    homeAria: "فهيم — الصفحة الرئيسية",
    navAria: "التنقّل الرئيسي",
    proof: "شاهده يشرح",
    reach: "لِمن هو",
    login: "تسجيل الدخول",
    startFree: "ابدأ مجانًا",
    switchToEnglish: "التبديل إلى الإنجليزية",
    switchToArabic: "التبديل إلى العربية",
  },
  hero: {
    ariaLabel: "فهيم — معلّمك الصبور بلغتك",
    chip: "مبنيّ على منهج البحرين — لا إجابات عامّة من الإنترنت",
    titleLead: "معلّم صبور،",
    titleAccent: "بلغتك،",
    titleMid: "يعرف مقرّرك البحريني",
    titleUnderlined: "بالضبط",
    titleTail: ".",
    subtitle:
      "فهيم يأخذ الجملة نفسها التي مرّت عليك في الصف بسرعة، ويشرحها لك بالعربية، بطريقة مختلفة في كلّ مرّة، حتّى تثبت في ذهنك. مربوطٌ بوحدتك ودرسك، لا بإجابةٍ عامّة قد لا تناسب امتحانك.",
    ctaPrimary: "ابدأ مجانًا الآن",
    ctaSecondary: "شاهده يشرح بالفعل",
    freeNote: "مجّاني خلال تجربة البحرين · بدون بطاقة",
    sliverNote: "— هذا ما سيظهر تحت كلّ إجابة. تابع لترى.",
  },
  proof: {
    ariaLabel: "إجابة حقيقية من فهيم، مبنيّة على منهجك",
    kicker: "الدقّة هي المنتج",
    title: "سؤالٌ واحد. إجابةٌ كاملة، بالعربية، من درسك أنت.",
    para: "هذه ليست صورة للمنتج، بل المنتج نفسه. طالبٌ يكتب سؤاله كما سمعه في الصف، فيكتب فهيم الإجابة كاملةً، يتحقّق منها، ثمّ يعرضها. لاحظ الشارة الخضراء: هي وحدتك ودرسك بالضبط.",
    youLabel: "أنت، الساعة 11 مساءً",
    faheemLabel: "فهيم · مُولّدة مباشرةً، غير معدّلة",
    chipStillUnclear: "ما زال غير واضح؟",
    chipDeepCheck: "تدقيق عميق",
    chipSaveLines: "احفظ الأسطر",
    chipListen: "استمع",
    captureNote:
      "إجابة حقيقية، وُلّدت مباشرةً من فهيم. غير معدّلة. المخطّط والجدول وسؤال التحقّق وسطر المراجعة الذاتيّة، كلّها جاءت من المعلّم — لا شيء منها مُصمّم يدويًّا.",
  },
  reexplain: {
    ariaLabel: "يبقى حتّى تفهم",
    title: "يبقى معك حتّى تفهم.",
    para1:
      "الفهم نادرًا ما يأتي من أوّل مرّة، وفهيم مبنيٌّ على هذه الحقيقة. تحت كلّ إجابة زرٌّ واحد صغير:",
    chip: "ما زال غير واضح؟",
    para2:
      "نقرةٌ واحدة، دون أن تحتاج إلى صياغة التباسك بالكلمات. ضغطناها على إجابة نيوتن بالأعلى، فتمهّل المعلّم، وترك الصيغة، وغيّر التشبيه كليًّا. من غير أيّ تعديل:",
    youLabel: "أنت، بنقرةٍ واحدة",
    faheemLabel: "فهيم · غير معدّلة",
    endsWithQuestion:
      "الردّ الحقيقيّ ينتهي بسؤال: «هل نجرّب سؤال كرة القدم الآن؟» وسينتظر جوابك. إنّه ينتظر دائمًا.",
    shape:
      "ما شاهدته له شكل: المعلّم ينزل معك أربع درجات، بقدر ما تحتاج، ولا يكرّر نفسه، ولا يتنهّد، ولا يمضي قُدمًا وأنت ما زلت تائهًا.",
    steps: [
      { title: "يبدأ من الإحساس", body: "من شعور الفكرة، لا من اسمها الرسميّ. نُنحّي الصيغة جانبًا أوّلًا." },
      { title: "مثالٌ جديد من عالمك", body: "كرة قدم، طبخ، عربة تسوّق… تشبيهٌ مختلف في كلّ مرّة، لا يتكرّر أبدًا." },
      { title: "أصغر خطوة، مع رسمة", body: "قطعةٌ صغيرة في كلّ مرّة، غالبًا مع مخطّطٍ يرسمه لك في اللحظة." },
      { title: "يجد مكان الالتباس", body: "سؤالٌ لطيف يحدّد الجملة التي توقّف عندها الفهم بالضبط." },
    ],
  },
  reach: {
    ariaLabel: "مصنوع لكلّ صفٍّ في البحرين",
    title: "يعرف في أيّ صفٍّ تجلس.",
    para:
      "أخبره بمنهجك، وصفّك من التاسع إلى الثاني عشر، ولغتك، والتشبيهات التي تناسب حياتك. الفكرة الفيزيائيّة نفسها، سُئلت للمعلّم الحيّ مرّتين، مرّةً بكلّ لغة:",
    twoAnswersNote:
      "سؤالٌ واحد، سُئل للمعلّم الحيّ مرّتين، مرّةً بكلّ لغة. كلا السطرين إجابتان كاملتان، غير معدّلتين.",
    boardsLabel: "مضبوطٌ على منهجك وامتحانك",
    boards: ["منهج البحرين · وزارة التربية", "CBSE", "Cambridge", "دراسة عامّة"],
    gradesLine: "الصفوف 9 إلى 12 · العربية · English",
    ways: [
      { title: "أسئلة بالصورة", body: "علِقتَ في مسألة مطبوعة؟ صوّر الصفحة واسأل مباشرةً." },
      { title: "جلسات صوتيّة", body: "تحدّث بصوتك واشرح ما التبس، كدرسٍ خصوصيٍّ لا ينظر إلى الساعة." },
      { title: "عالم تشبيهاتك", body: "عقلٌ يحبّ كرة القدم؟ أو الطبخ؟ اختر العالم الذي تأتي منه أمثلتك." },
    ],
  },
  capabilities: {
    ariaLabel: "كل ما يفعله المعلّم الصبور",
    kicker: "معلّمٌ كامل، لا مجرّد إجابة",
    title: "كلّ ما يفعله المعلّم الصبور، في مكانٍ واحد.",
    subtitle: "ليست دردشةً عامّة، بل تجربة تعليمٍ كاملة مبنيّة على منهجك — من السؤال إلى الإتقان.",
    cards: [
      { title: "إجابةٌ جاهزة للامتحان", body: "إجابةٌ كاملة، منظّمة كما يريدها المُمتحِن، لا فقرةٌ عامّة من الإنترنت." },
      { title: "يتحقّق قبل أن يعرض", body: "كلّ إجابةٍ رقميّة تُراجَع مرّةً ثانية كممتحِنٍ مستقلّ قبل أن تصل إليك." },
      { title: "إعادة شرحٍ بنقرة", body: "ما زال غير واضح؟ نقرةٌ واحدة، فيغيّر التشبيه كليًّا حتّى يثبت في ذهنك." },
      { title: "دفتر التسع خطوات", body: "الفكرة الكبرى، مثالٌ من حياتك، خطأٌ شائع، سؤال تحقّق… درسٌ منظّم لا مجرّد ردّ." },
      { title: "أسئلة بالصورة وبالصوت", body: "صوّر مسألةً مطبوعة، أو تحدّث بصوتك — كدرسٍ خصوصيٍّ لا ينظر إلى الساعة." },
      { title: "بلغتَيك معًا", body: "بالعربية أوّلًا، وبالإنجليزية بنقرة. الإجابة نفسها، بلغتك أنت." },
    ],
  },
  cta: {
    ariaLabel: "ابدأ التعلّم",
    kicker: "مجّاني خلال تجربة البحرين",
    title: "غدًا، حين تمرّ كلمةٌ بسرعة في الصف، دعها تمرّ.",
    para:
      "صار لديك معلّمٌ صبور بلغتك، يعرف مقرّرك، ويبقى معك حتّى تفهم. مجّانيٌّ ما دامت التجربة، لأنّنا نريد أن نكسب ثقتك أوّلًا.",
    button: "ابدأ التعلّم مجانًا",
    buttonNote: "بدون بطاقة. سجّل الدخول واسأل سؤالك الأوّل.",
    included: [
      "منهج البحرين · CBSE · Cambridge",
      "العربية والإنجليزية",
      "إجابات جاهزة للامتحان + دفتر التسع خطوات",
      "تدقيق عميق كممتحنٍ ثانٍ",
      "أسئلة بالصورة وجلسات صوتيّة",
    ],
    parentNote:
      "إلى وليّ الأمر الذي يقرأ هذا: لا شيء تدفعه ولا شيء تلغيه. فهيم مجّانيٌّ طوال التجربة. وإذا أطلقنا خطّةً يومًا ما، فسنعلن عنها بوضوح، لن تُفعَّل بصمت، ولن تكون بعدّادٍ تنازليّ.",
  },
  footer: {
    tagline: "معلّمٌ صبور لكلّ طالبٍ في البحرين.",
    navAria: "روابط التذييل",
    proof: "شاهده يشرح",
    reach: "لِمن هو",
    support: "الدعم",
    login: "تسجيل الدخول",
    copyrightLead: "© 2026 فهيم · فهيم منتَجٌ من Clarify.AI · لأيّ سؤال أو استفسار، راسلنا على ",
    copyrightTail: ".",
  },
};

const EN: LandingCopy = {
  header: {
    homeAria: "Faheem — home",
    navAria: "Main navigation",
    proof: "See it teach",
    reach: "Who it's for",
    login: "Sign in",
    startFree: "Start free",
    switchToEnglish: "Switch to English",
    switchToArabic: "Switch to Arabic",
  },
  hero: {
    ariaLabel: "Faheem — your patient teacher, in your language",
    chip: "Built on the Bahrain curriculum — not generic answers from the internet",
    titleLead: "A patient teacher,",
    titleAccent: "in your language,",
    titleMid: "that knows your Bahrain syllabus",
    titleUnderlined: "exactly",
    titleTail: ".",
    subtitle:
      "Faheem takes the very sentence that rushed past you in class and explains it in Arabic, a different way each time, until it sticks. Tied to your unit and your lesson — not a generic answer that may not match your exam.",
    ctaPrimary: "Start free now",
    ctaSecondary: "Watch it actually teach",
    freeNote: "Free during the Bahrain trial · no card",
    sliverNote: "— this appears under every answer. Keep going to see.",
  },
  proof: {
    ariaLabel: "A real answer from Faheem, built on your syllabus",
    kicker: "Accuracy is the product",
    title: "One question. A complete answer, in Arabic, from your own lesson.",
    para: "This isn't a screenshot of the product — it's the product itself. A student types their question as they heard it in class, and Faheem writes the full answer, verifies it, then shows it. Notice the green chip: it's your exact unit and lesson.",
    youLabel: "You, 11 PM",
    faheemLabel: "Faheem · generated live, unedited",
    chipStillUnclear: "Still unclear?",
    chipDeepCheck: "Deep check",
    chipSaveLines: "Save the lines",
    chipListen: "Listen",
    captureNote:
      "A real answer, generated live by Faheem. Unedited. The diagram, the table, the quick-check question and the self-review line all came from the teacher — none of it hand-designed.",
  },
  reexplain: {
    ariaLabel: "It stays until you understand",
    title: "It stays with you until you understand.",
    para1:
      "Understanding rarely comes on the first try, and Faheem is built on that truth. Under every answer sits one small button:",
    chip: "Still unclear?",
    para2:
      "One tap — no need to put your confusion into words. We pressed it on the Newton answer above, and the teacher slowed down, dropped the formula, and changed the analogy entirely. Unedited:",
    youLabel: "You, one tap",
    faheemLabel: "Faheem · unedited",
    endsWithQuestion:
      "The real reply ends with a question: “Shall we try the football question now?” — and it waits for your answer. It always waits.",
    shape:
      "What you just watched has a shape: the teacher steps down with you, as far as you need, never repeating itself, never sighing, never moving on while you're still lost.",
    steps: [
      { title: "It starts from the feeling", body: "From the feel of the idea, not its formal name. We set the formula aside first." },
      { title: "A fresh example from your world", body: "Football, cooking, a shopping cart… a different analogy every time, never repeated." },
      { title: "The smallest step, with a sketch", body: "A small piece each time, often with a diagram it draws for you on the spot." },
      { title: "It finds where you got lost", body: "A gentle question that pinpoints the exact sentence your understanding stopped at." },
    ],
  },
  reach: {
    ariaLabel: "Made for every classroom in Bahrain",
    title: "It knows which class you're in.",
    para:
      "Tell it your board, your grade from nine to twelve, your language, and the analogies that fit your life. The same physics idea, asked to the live teacher twice — once in each language:",
    twoAnswersNote:
      "One question, asked to the live teacher twice, once in each language. Both lines are complete answers, unedited.",
    boardsLabel: "Tuned to your syllabus and exam",
    boards: ["Bahrain MoE", "CBSE", "Cambridge", "General study"],
    gradesLine: "Grades 9 to 12 · العربية · English",
    ways: [
      { title: "Snap a photo", body: "Stuck on a printed problem? Photograph the page and ask right away." },
      { title: "Voice sessions", body: "Speak out loud and explain what confused you, like a private tutor that never watches the clock." },
      { title: "Your analogy world", body: "A mind that loves football? Or cooking? Choose the world your examples come from." },
    ],
  },
  capabilities: {
    ariaLabel: "Everything a patient teacher does",
    kicker: "A whole teacher, not just an answer",
    title: "Everything a patient teacher does, in one place.",
    subtitle: "Not a generic chatbot — a full teaching experience built on your syllabus, from the question all the way to mastery.",
    cards: [
      { title: "Exam-ready answers", body: "A complete answer, structured the way the examiner wants it — not a generic paragraph from the internet." },
      { title: "Verifies before it shows", body: "Every numeric answer is reviewed a second time, like an independent examiner, before it reaches you." },
      { title: "Re-explain in one tap", body: "Still unclear? One tap, and it changes the analogy entirely until the idea sticks." },
      { title: "The nine-step notebook", body: "Big idea, an example from your life, a common mistake, a quick check… a structured lesson, not just a reply." },
      { title: "Photo and voice questions", body: "Snap a printed problem, or just speak — like a private tutor that never watches the clock." },
      { title: "Both your languages", body: "Arabic first, English in one tap. The same answer, in your language." },
    ],
  },
  cta: {
    ariaLabel: "Start learning",
    kicker: "Free during the Bahrain trial",
    title: "Tomorrow, when a word rushes past in class, let it pass.",
    para:
      "Now you have a patient teacher in your language, who knows your syllabus and stays with you until you understand. Free for as long as the trial lasts, because we want to earn your trust first.",
    button: "Start learning free",
    buttonNote: "No card. Sign in and ask your first question.",
    included: [
      "Bahrain MoE · CBSE · Cambridge",
      "Arabic and English",
      "Exam-ready answers + the nine-step notebook",
      "A deep check, like a second examiner",
      "Photo questions and voice sessions",
    ],
    parentNote:
      "To the parent reading this: nothing to pay, nothing to cancel. Faheem is free throughout the trial. And if we ever launch a plan, we'll announce it clearly — it won't switch on silently, and it won't come with a countdown.",
  },
  footer: {
    tagline: "A patient teacher for every student in Bahrain.",
    navAria: "Footer links",
    proof: "See it teach",
    reach: "Who it's for",
    support: "Support",
    login: "Sign in",
    copyrightLead: "© 2026 Faheem · a Clarify.AI product · for any question, reach us at ",
    copyrightTail: ".",
  },
};

const COPY: Record<Lang, LandingCopy> = { ar: AR, en: EN };

/** Active landing copy, following the app-wide locale. */
export function useLandingCopy(): { lang: Lang; dir: Dir; c: LandingCopy } {
  const { lang, dir } = useLocale();
  return { lang, dir, c: COPY[lang] };
}
