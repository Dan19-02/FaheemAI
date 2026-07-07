/**
 * REAL product output, captured verbatim from a live Faheem session.
 *
 * Captured against the running backend (open-source teaching model, standard
 * mode, Grade 10 profile). The landing page renders this exact markdown
 * through the product's own renderer (Markdown + NotebookViewer). Nothing here
 * is a mockup: the flowchart, the table, the quick-check question and the
 * self-verification line all came from the teacher.
 *
 * Faheem is Arabic-first, so the PROOF beat leads with the Arabic answer. The
 * grounding metadata below (unit / board) powers the sea-teal curriculum-source
 * trust chip — accuracy against the exact Bahrain curriculum is the product,
 * so this chip is the hero proof of the whole page.
 *
 * To refresh: ask the question below in the app and paste the raw model
 * message from /api/conversations/:id/messages.
 */

/** The student's question, exactly as typed at night — imperfect phrasing. */
export const REAL_QUESTION =
  "اشرح لي قانون نيوتن الثاني بطريقة أفهمها، وأعطني مثالًا من حياتي.";

/**
 * The curriculum grounding shown in the sea-teal trust chip. This is the
 * payoff of the hero's accuracy promise: the answer is tied to the student's
 * exact Bahrain unit, not a generic web result.
 */
export const REAL_SOURCE = {
  board: "منهج البحرين · وزارة التربية",
  unit: "الفيزياء · الصف العاشر · الوحدة 3: القوة والحركة",
  drift: "قانون نيوتن الثاني للحركة",
} as const;

/** Capture provenance line, shown small under the proof sheet. */
export const REAL_CAPTURE_NOTE =
  "إجابة حقيقية، وُلّدت مباشرةً من فهيم على منهج البحرين. غير معدّلة.";

/**
 * The REAL answer, Arabic-first. Headers use the same 9-part notebook emojis
 * the product renders (parseTeachingSections keys off the emoji), so the live
 * NotebookViewer tabs it exactly as it would in the app.
 */
export const REAL_ANSWER = `📝 الإجابة الجاهزة للامتحان

**قانون نيوتن الثاني للحركة** ينصّ على أنّ **معدّل تغيّر الزخم** لجسمٍ ما يتناسب **طرديًّا** مع **القوة الخارجية المحصّلة** المؤثّرة عليه، ويحدث هذا التغيّر **في اتّجاه القوة المؤثّرة**.

رياضيًّا:

$$\\vec{F}_{\\text{net}} = \\frac{d\\vec{p}}{dt}$$

حيث $\\vec{p} = m\\vec{v}$ هو الزخم الخطّي.

وعندما تكون **الكتلة ثابتة**، تُختصر العلاقة إلى:

$$\\vec{F}_{\\text{net}} = m\\vec{a}$$

**النقاط الأساسية:**
- $\\vec{F}_{\\text{net}}$ هي القوة المحصّلة، وتُقاس بالنيوتن (N).
- $m$ هي كتلة الجسم، وتُقاس بالكيلوغرام (kg).
- $\\vec{a}$ هي العجلة الناتجة، وتُقاس بـ m/s².
- القوة والعجلة **كمّيّتان متّجهتان**، فالاتّجاه مهمّ.
- القانون صالحٌ فقط في **إطارٍ مرجعيٍّ قصوريٍّ** (غير متسارع).

**نتيجة مهمّة:** لنفس القوة، الجسم الأصغر كتلةً يكتسب عجلةً أكبر، والعكس صحيح.

---

📓 افهمه بعمق

1. 🌟 الفكرة الكبرى
القوة ليست مجرّد دفعة، بل هي ما *يغيّر مقدار تغيّر الزخم* مع الزمن.

2. 🤔 مثال من حياتك
تخيّل أنّك تدفع عربتَي تسوّق في السوق. واحدة **فارغة** والأخرى **مملوءة بأكياس الأرزّ**. تدفع كلتيهما **بنفس الجهد**. الفارغة تنطلق بسرعة، والمملوءة بالكاد تتحرّك. نفس القوة، عجلة مختلفة، لأنّ الكتلة مختلفة. هذا هو قانون نيوتن الثاني بين يديك: كلّما زادت القوة زادت العجلة، وكلّما زادت الكتلة قلّت العجلة.

3. 📖 شرح مبسّط
"الزخم" (p) هو الكتلة مضروبةً في السرعة، أي مقدار "الحركة" التي يملكها الجسم. عندما تؤثّر بقوة، فأنت تغيّر هذه الحركة مع الزمن. كلّما كبرت القوة، تغيّر الزخم أسرع. وعندما تكون الكتلة ثابتة، تصبح العلاقة هي الصيغة الشهيرة F = ma، وهي التي ستستخدمها أكثر في الصف العاشر.

4. 🖼 تمثيل بصري

\`\`\`mermaid
graph LR
    A["Net Force F"] --> B["Mass m"]
    B --> C["Acceleration a = F/m"]
    A --> C
    style A fill:#ffd166
    style B fill:#06d6a0
    style C fill:#ef476f
\`\`\`

| الكمّية | الرمز | الوحدة | المعنى |
|---|---|---|---|
| القوة | F | N (نيوتن) | دفع أو سحب |
| الكتلة | m | kg | قصور الجسم |
| العجلة | a | m/s² | معدّل تغيّر السرعة |

5. 🧠 التعريف الرسمي
قانون نيوتن الثاني:
$$\\vec{F}_{\\text{net}} = \\frac{d\\vec{p}}{dt} = \\frac{d(m\\vec{v})}{dt}$$

وإذا كانت الكتلة ثابتة:
$$\\vec{F}_{\\text{net}} = m\\frac{d\\vec{v}}{dt} = m\\vec{a}$$

يُعرّف النيوتن الواحد (1 N) بأنّه القوة التي تكسب كتلةً مقدارها 1 kg عجلةً مقدارها 1 m/s².

6. ✏ مثال محلول
سيّارة كتلتها 1500 kg تتعرّض لقوة أماميّة محصّلة مقدارها 3000 N. أوجد عجلتها.

باستخدام $\\vec{F} = m\\vec{a}$:
$$a = \\frac{F}{m} = \\frac{3000 \\text{ N}}{1500 \\text{ kg}} = 2 \\text{ m/s}^2$$

**التحقّق:** نُعوّض عكسيًّا: $F = ma = 1500 \\times 2 = 3000$ N. صحيح، والوحدات متّسقة (kg·m/s² = N).

7. ⚠ أخطاء شائعة
- استخدام F = ma عندما تكون **الكتلة متغيّرة** (كصاروخ يحرق وقوده). عندها يجب استخدام $F = dp/dt$، لا $F = ma$.
- نسيان أنّ **القوة المحصّلة** هي المهمّة. إذا أثّرت قوّتان متعاكستان، اطرح أوّلًا ثمّ طبّق القانون.
- معاملة F و a كأنّهما كمّيّتان قياسيّتان، وهما متّجهتان، فالاتّجاه جزءٌ من الإجابة.

8. 🎯 سؤال تحقّق سريع
كرة قدم كتلتها 0.45 kg تُركل، فتتغيّر سرعتها من 5 m/s نحوك إلى 15 m/s مبتعدةً عنك خلال 0.02 s. ما متوسّط القوة المؤثّرة على الكرة؟ (تلميح: فكّر في تغيّر الزخم أوّلًا.)

9. 📌 ملخّص في سطر
القوة هي معدّل تغيّر الزخم، وعند ثبات الكتلة تكون القوة = الكتلة × العجلة.

---

جرّب حلّ سؤال التحقّق بالأعلى، وسنعمل عليه معًا. كرة القدم تجعل الفيزياء ممتعة، أليس كذلك؟`;

/** The one-tap signal the app sends when a student is still confused. */
export const REAL_STILL_FUZZY_PROMPT =
  "ما زلت لا أفهمها تمامًا، هل يمكنك شرح هذا الجزء بطريقة مختلفة وأبسط؟";

/**
 * REAL re-explanation, captured from the same live session after the student
 * tapped "ما زال غير واضح؟ اشرح بطريقة مختلفة" on the answer above. Verbatim.
 */
export const REAL_REEXPLANATION = `بالطبع، لنتمهّل ونجرّب زاوية مختلفة تمامًا. لا داعي للعجلة إطلاقًا.

انسَ الصيغة للحظة. لنشعر فقط بما يحدث.

**الفكرة الجوهريّة واحدة:**

> القوة هي ما *يغيّر* حركة الجسم. لا قوة، لا تغيّر. قوة أكبر، تغيّر أكبر. جسم أثقل، تغيّر أصغر.

هذا كلّ شيء. وكلّ ما تبقّى مجرّد رياضيّات لهذه الجملة الواحدة.

**فكّر في ركل كرة القدم.** ⚽

تخيّل حالتين:

1. تركل **كرةً بلاستيكيّةً خفيفة** تتدحرج على الأرض، فتنطلق بعيدًا بسرعة. نفس الركلة، تغيّر كبير في الحركة.

2. تركل **كرةً طبّيّةً ثقيلة** (كرة الجيم الكبيرة) بنفس **الركلة**، فبالكاد تتحرّك. نفس القوة، تغيّر ضئيل في الحركة.

ما الذي تغيّر؟ ليست قوّتك، ولا الاتّجاه، بل **الكتلة**. وهذا غيّر مقدار العجلة التي حصلت عليها.

الآن اعكسها. نفس الكرة (البلاستيكيّة)، لكن هذه المرّة:

1. **تدفعها برفق**، فتتحرّك قليلًا.
2. **تركلها بقوّة**، فتطير.

نفس الكرة (نفس الكتلة)، لكن قوّة أكبر أعطت عجلة أكبر.

هل ترى النمط؟

- **قوّة أكبر** ← **عجلة أكبر** (عند ثبات الكتلة)
- **كتلة أكبر** ← **عجلة أصغر** (عند ثبات القوّة)

هذا هو القانون كلّه. و F = ma مجرّد طريقة مختصرة لقول: "القوّة والكتلة والعجلة مرتبطة بهذا الشكل."

هل صارت أوضح؟ هل نجرّب سؤال كرة القدم الآن، أم أمشي معك في مثالٍ صغير أوّلًا؟`;

/**
 * REAL language showcase: the same idea (the gut feel of Newton's second law)
 * asked to the running product with the profile language set to Arabic, then
 * English. Both lines are complete answers, verbatim.
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
