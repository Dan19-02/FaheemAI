/**
 * REAL product output, captured from a live Faheem session (Grade 10 profile,
 * Arabic). The landing renders this exact markdown through the product's OWN
 * Markdown renderer, so what visitors see IS the product's answer style: clear,
 * simple, complete. Nothing here is a mockup.
 *
 * To refresh: ask the question below in the app and paste the raw model message.
 */

/** The student's question, exactly as typed at night — imperfect phrasing. */
export const REAL_QUESTION =
  "اشرح لي قانون نيوتن الثاني بطريقة أفهمها، وأعطني مثالًا من حياتي.";

/** The curriculum grounding shown in the sea-teal trust chip (an optional aid,
 *  shown when the answer happens to line up with the student's unit). */
export const REAL_SOURCE = {
  board: "منهج البحرين · وزارة التربية",
  unit: "الفيزياء · الصف العاشر · القوة والحركة",
  drift: "قانون نيوتن الثاني للحركة",
} as const;

/** Capture provenance line, shown small under the proof sheet. */
export const REAL_CAPTURE_NOTE =
  "إجابة حقيقية، وُلّدت مباشرةً من فهيم. غير معدّلة.";

/**
 * The REAL answer, Arabic-first — the product's new SIMPLE style: the answer
 * first, one everyday example, one quick worked example, a one-line takeaway,
 * and a small check question. No rigid template.
 */
export const REAL_ANSWER = `قانون نيوتن الثاني يقول ببساطة: **كلّما دفعتَ جسمًا بقوّة أكبر، تسارع أسرع؛ وكلّما كان أثقل، تسارع أبطأ لنفس الدفعة.**

الصيغة التي ستستخدمها في الصف العاشر:

$$F = m \\times a$$

- $F$ القوّة، بالنيوتن (Newton).
- $m$ الكتلة، بالكيلوغرام (kg).
- $a$ العجلة، أي مدى تغيّر السرعة (m/s²).

**مثال من حياتك:** تخيّل عربتَي تسوّق، واحدة فارغة وأخرى مملوءة بالأرزّ، وتدفع كلتيهما بنفس الجهد. الفارغة تنطلق بسرعة، والمملوءة بالكاد تتحرّك. نفس القوّة، لكن الكتلة الأكبر أعطت عجلةً أصغر. هذا هو القانون بين يديك.

**مثال محلول بسرعة:** سيّارة كتلتها 1000 kg تُدفع بقوّة 2000 N. عجلتها:

$$a = \\frac{F}{m} = \\frac{2000}{1000} = 2 \\ \\text{m/s}^2$$

نتحقّق عكسيًّا: $F = m \\times a = 1000 \\times 2 = 2000$ N. صحيح.

باختصار: **القوّة = الكتلة × العجلة.** زد القوّة يزد التسارع، وزد الكتلة يقلّ التسارع.

سؤال صغير لك: لو ركلتَ كرة قدم كتلتها 0.45 kg وأعطيتها عجلة 30 m/s²، فما مقدار القوّة التي أثّرت بها؟`;

/** The one-tap signal the app sends when a student is still confused. */
export const REAL_STILL_FUZZY_PROMPT =
  "ما زلت لا أفهمها تمامًا، هل يمكنك شرح هذا الجزء بطريقة مختلفة وأبسط؟";

/**
 * REAL re-explanation, captured after the student tapped "اشرح بطريقة مختلفة"
 * on the answer above. A genuinely different, simpler angle. Verbatim.
 */
export const REAL_REEXPLANATION = `بالطبع، لنتمهّل ونجرّب زاوية مختلفة تمامًا. لا داعي للعجلة إطلاقًا.

انسَ الصيغة للحظة. لنشعر فقط بما يحدث.

**الفكرة الجوهريّة واحدة:**

> القوة هي ما *يغيّر* حركة الجسم. لا قوة، لا تغيّر. قوة أكبر، تغيّر أكبر. جسم أثقل، تغيّر أصغر.

هذا كلّ شيء. وكلّ ما تبقّى مجرّد رياضيّات لهذه الجملة الواحدة.

**فكّر في ركل كرة القدم.** ⚽

تركل **كرةً بلاستيكيّةً خفيفة**، فتنطلق بعيدًا بسرعة. نفس الركلة، تغيّر كبير في الحركة. ثمّ تركل **كرةً طبّيّةً ثقيلة** بنفس الركلة، فبالكاد تتحرّك. نفس القوّة، لكن الكتلة غيّرت مقدار العجلة.

- **قوّة أكبر** ← **عجلة أكبر** (عند ثبات الكتلة)
- **كتلة أكبر** ← **عجلة أصغر** (عند ثبات القوّة)

هذا هو القانون كلّه. و F = ma مجرّد طريقة مختصرة لقوله.

هل نجرّب سؤال كرة القدم الآن، أم أمشي معك في مثالٍ صغير أوّلًا؟`;

/**
 * REAL language showcase: the same idea in Arabic, then English. Both are
 * complete answers, verbatim.
 */
export const REAL_VOICES = [
  {
    tag: "العربية",
    lang: "ar",
    line:
      "قانون نيوتن الثاني ببساطة: كلّما دفعتَ شيئًا بقوّة أكبر، ازدادت سرعته أسرع، وكلّما كان أثقل، احتاج إلى قوّة أكبر لتغيير حركته بالمقدار نفسه.",
    scope: "إجابة كاملة",
  },
  {
    tag: "English",
    lang: "en",
    line:
      "Newton's second law just says: the harder you push something, the faster it speeds up, and the heavier it is, the slower it speeds up for the same push.",
    scope: "complete answer",
  },
] as const;
