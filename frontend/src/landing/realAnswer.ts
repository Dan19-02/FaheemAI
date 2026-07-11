/**
 * REAL product output, captured from a live Faheem session (Grade 10 profile,
 * Arabic). The landing renders this exact markdown through the product's OWN
 * Markdown renderer, so what visitors see IS the product's answer style: clear,
 * simple, complete. Nothing here is a mockup.
 *
 * To refresh: ask the question below in the app and paste the raw model message.
 */

/** The student's question, exactly as typed at night, imperfect phrasing. */
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
 * The REAL answer, Arabic-first, in the product's full study-notebook shape:
 * an Exam-Ready Answer, then the nine emoji sections the app tabs. The language
 * inside each section is kept simple; the emoji headers drive parseTeachingSections
 * (which keys on the emoji, so Arabic titles render as the tab labels).
 */
export const REAL_ANSWER = `📝 الإجابة الجاهزة للامتحان

**قانون نيوتن الثاني للحركة** ينصّ على أنّ **معدّل تغيّر الزخم** لجسمٍ ما يتناسب **طرديًّا** مع **القوة المحصّلة** المؤثّرة عليه، ويحدث التغيّر **في اتّجاه القوة**.

وعندما تكون **الكتلة ثابتة**، تُختصر العلاقة إلى:

$$\\vec{F}_{\\text{net}} = m\\vec{a}$$

**النقاط الأساسية:**
- $F$ القوّة المحصّلة، وتُقاس بالنيوتن (N).
- $m$ كتلة الجسم، بالكيلوغرام (kg).
- $a$ العجلة الناتجة، بوحدة m/s².
- القوّة والعجلة **كمّيّتان متّجهتان**، فالاتّجاه مهمّ.

---

📓 افهمه بعمق

1. 🌟 الفكرة الكبرى
القوة ليست مجرّد دفعة، بل هي ما *يغيّر حركة* الجسم: كلّما زادت القوّة زاد التسارع، وكلّما زادت الكتلة قلّ التسارع.

2. 🤔 مثال من حياتك
تخيّل عربتَي تسوّق، واحدة **فارغة** والأخرى **مملوءة بأكياس الأرزّ**، وتدفع كلتيهما **بنفس الجهد**. الفارغة تنطلق بسرعة، والمملوءة بالكاد تتحرّك. نفس القوّة، عجلة مختلفة، لأنّ الكتلة مختلفة. هذا هو قانون نيوتن الثاني بين يديك.

3. 📖 شرح مبسّط
القوّة (Force) هي ما يجعل سرعة الجسم تتغيّر. كلّما دفعتَ بقوّة أكبر، تغيّرت السرعة أسرع، أي تسارع أكبر. ولكن كلّما كان الجسم أثقل، احتاج إلى قوّة أكبر ليتسارع بنفس المقدار. هذه العلاقة الثلاثيّة هي كلّ القانون.

4. 🖼 تمثيل بصري

\`\`\`mermaid
graph LR
    A["Force F"] --> C["a = F / m"]
    B["Mass m"] --> C
\`\`\`

| الكمّية | الرمز | الوحدة |
|---|---|---|
| القوّة | F | N |
| الكتلة | m | kg |
| العجلة | a | m/s² |

5. 🧠 التعريف الرسمي
عند ثبات الكتلة، القوّة المحصّلة تساوي الكتلة مضروبةً في العجلة:
$$F = m \\times a$$
يُعرّف النيوتن الواحد (1 N) بأنّه القوّة التي تكسب كتلةً مقدارها 1 kg عجلةً مقدارها 1 m/s².

6. ✏ مثال محلول
سيّارة كتلتها 1000 kg تتعرّض لقوّة محصّلة 2000 N. أوجد عجلتها.
$$a = \\frac{F}{m} = \\frac{2000}{1000} = 2 \\ \\text{m/s}^2$$
**التحقّق:** $F = m \\times a = 1000 \\times 2 = 2000$ N. صحيح، والوحدات متّسقة.

7. ⚠ أخطاء شائعة
- نسيان أنّ **القوّة المحصّلة** هي المهمّة: اجمع القوى (مع الاتّجاه) أوّلًا ثمّ طبّق القانون.
- معاملة القوّة والعجلة كأنّهما عددان فقط، وهما متّجهان، فالاتّجاه جزء من الإجابة.

8. 🎯 سؤال تحقّق سريع
كرة قدم كتلتها 0.45 kg تُركل فتكتسب عجلة مقدارها 30 m/s². ما مقدار القوّة التي أثّرت بها القدم؟

9. 📌 ملخّص في سطر
عند ثبات الكتلة: القوّة = الكتلة × العجلة. زد القوّة يزد التسارع، وزد الكتلة يقلّ التسارع.`;

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
