/**
 * DEV-ONLY preview harness for the signed-in workspace.
 *
 * The logged-in study desk is normally gated behind the Express + JWT backend,
 * so there is no way to see it, or its many states, without a live server and a
 * real account. This module lets a designer open the workspace with realistic
 * seeded data by visiting `?preview=1` on the dev server. It is gated on
 * `import.meta.env.DEV`, so a production build compiles it out entirely and it
 * can never activate for a real user.
 *
 * It patches the `api` object in place with resolved mock responses and seeds a
 * placeholder token, so AuthContext restores a "session" and App renders the
 * full desk. Nothing here ships.
 */
import type { api as ApiShape } from "./api";
import type { Account, PlansResponse } from "./api";
import { REAL_ANSWER, REAL_QUESTION, REAL_REEXPLANATION } from "./landing/realAnswer";
import type {
  ChatMessage,
  Conversation,
  NotebookSummary,
  Subscription,
} from "./types";

export function isPreview(): boolean {
  return (
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("preview")
  );
}

/** Which seeded scenario to show, chosen by `?preview=<scenario>`. */
function scenario(): string {
  if (typeof window === "undefined") return "1";
  return new URLSearchParams(window.location.search).get("preview") || "1";
}

const NOW = "2026-07-06T09:00:00.000Z";

// Bahrain pilot persona: a Grade 10 MoE student, Arabic-first, with her
// Chapter Mastery list drawn from the Grade 10 physics units.
const MOCK_ACCOUNT: Account = {
  id: 1,
  email: "noor@example.com",
  profile: {
    name: "Noor",
    board: "Bahrain MoE",
    grade: "Grade 10",
    language: "Arabic",
    preferredAnalogy: "Daily Life",
    confidenceLevel: 3,
    examGoals: "أن أفهم الفيزياء فهمًا حقيقيًا وأتفوّق في امتحانات الفصل، لا مجرد الحفظ.",
  },
  chapters: [
    { id: "ch-1", name: "الحركة الخطية", mastery: "weak", confidenceScore: 25, lastStudied: "2026-07-05" },
    { id: "ch-2", name: "قوانين نيوتن", mastery: "weak", confidenceScore: 25, lastStudied: "2026-07-04" },
    { id: "ch-3", name: "الشغل والطاقة", mastery: "developing", confidenceScore: 50, lastStudied: "2026-07-03" },
    { id: "ch-4", name: "كمية التحرك", mastery: "developing", confidenceScore: 50, lastStudied: "2026-07-02" },
    { id: "ch-5", name: "الحرارة", mastery: "strong", confidenceScore: 85, lastStudied: "2026-07-01" },
  ],
  subscription: mockSubscription(),
};

function mockSubscription(): Subscription {
  const s = scenario();
  if (s === "trial") {
    return {
      plan: "trial", planName: "Free trial", state: "trial", active: true,
      limit: 10, used: 8, remaining: 2, periodType: "day",
      resetAt: "2026-07-07T00:00:00.000Z", trialEndsAt: "2026-07-12T00:00:00.000Z", planExpiresAt: null,
    };
  }
  if (s === "locked") {
    return {
      plan: "trial", planName: "Free trial", state: "trial_expired", active: false,
      limit: 10, used: 10, remaining: 0, periodType: "day",
      resetAt: null, trialEndsAt: "2026-07-01T00:00:00.000Z", planExpiresAt: null,
    };
  }
  return {
    plan: "unlimited", planName: "Unlimited", state: "active", active: true,
    limit: null, used: 142, remaining: null, periodType: "pass",
    resetAt: "2026-08-05T00:00:00.000Z", trialEndsAt: null, planExpiresAt: "2026-08-05T00:00:00.000Z",
  };
}

const CONVERSATIONS: Conversation[] = [
  { id: "c1", title: "Explain Newton's Second Law at an exam level", messageCount: 4, updatedAt: NOW },
  { id: "c2", title: "Difference between mitosis and meiosis", messageCount: 2, updatedAt: "2026-07-05T18:00:00.000Z" },
  { id: "c3", title: "Why does ice float on water?", messageCount: 2, updatedAt: "2026-07-04T21:30:00.000Z" },
  { id: "c4", title: "Roots of a quadratic equation", messageCount: 2, updatedAt: "2026-07-03T20:00:00.000Z" },
];

const MESSAGES: Record<string, ChatMessage[]> = {
  c1: [
    {
      id: "m1", role: "user", text: REAL_QUESTION, timestamp: "9:00 AM",
    },
    {
      id: "m2", role: "model", text: REAL_ANSWER, timestamp: "9:00 AM",
      verification: "passed",
    },
    {
      id: "m3", role: "user", text: "I still don't fully get it, can you explain that part differently, in a simpler way?", timestamp: "9:02 AM",
    },
    {
      id: "m4", role: "model", text: REAL_REEXPLANATION, timestamp: "9:02 AM",
    },
  ],
  c2: [
    { id: "n1", role: "user", text: "What is the difference between mitosis and meiosis? I am preparing for my biology exam.", timestamp: "6:00 PM" },
    {
      id: "n2", role: "model", timestamp: "6:00 PM",
      text: "Great question, and an exam favourite. Here is the cleanest way to hold the two apart.\n\n**Mitosis** makes two identical body cells (growth, repair). One division, chromosome number stays the same: a diploid cell (2n) gives two diploid cells (2n).\n\n**Meiosis** makes four genetically different sex cells (gametes). Two divisions, chromosome number halves: a diploid cell (2n) gives four haploid cells (n).\n\n| Feature | Mitosis | Meiosis |\n|---|---|---|\n| Divisions | One | Two |\n| Daughter cells | 2 | 4 |\n| Chromosome number | Same (2n) | Halved (n) |\n| Genetic result | Identical | Varied (crossing over) |\n| Where | Body cells | Germ cells |\n\n**One-line memory hook:** mi**T**osis is for **T**issue (growth), me**I**osis is for **I**nheritance (gametes).",
    },
  ],
  c3: [
    { id: "i1", role: "user", text: "Why does ice float on water?", timestamp: "9:30 PM" },
    {
      id: "i2", role: "model", timestamp: "9:30 PM",
      text: "Because ice is **less dense** than the water it floats on, which is unusual: most things get denser when they freeze.\n\nWhen water freezes, its molecules lock into an open, hexagonal lattice held apart by hydrogen bonds. That structure keeps the molecules *further apart* than they are in liquid water, so the same mass takes up more volume. Less mass per unit volume means lower density, and anything less dense than water floats.\n\nThis is why lakes freeze top-down, not bottom-up, and fish survive the winter under the ice.",
    },
  ],
  c4: [
    { id: "q1", role: "user", text: "How do I find the roots of a quadratic equation?", timestamp: "8:00 PM" },
    {
      id: "q2", role: "model", timestamp: "8:00 PM",
      text: "For any quadratic $ax^2 + bx + c = 0$ (with $a \\neq 0$), the roots come straight from the quadratic formula:\n\n$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n\nThe piece under the root, $b^2 - 4ac$, is the **discriminant**. It tells you what kind of roots you have before you even solve:\n\n- $b^2 - 4ac > 0$: two distinct real roots\n- $b^2 - 4ac = 0$: one repeated real root\n- $b^2 - 4ac < 0$: two complex roots\n\nTry it on $x^2 - 5x + 6 = 0$: the discriminant is $25 - 24 = 1$, so $x = \\frac{5 \\pm 1}{2}$, giving $x = 3$ or $x = 2$.",
    },
  ],
};

const NOTEBOOK_SUMMARY: Record<string, NotebookSummary> = {
  default: {
    locked: false,
    savedCount: 7,
    subjects: [
      {
        subject: "الفيزياء", count: 5,
        chapters: [
          { chapter: "قوانين نيوتن", count: 3, latestAt: NOW },
          { chapter: "الحركة الخطية", count: 2, latestAt: "2026-07-04T00:00:00.000Z" },
        ],
      },
      {
        subject: "الأحياء", count: 2,
        chapters: [{ chapter: "انقسام الخلية", count: 2, latestAt: "2026-07-02T00:00:00.000Z" }],
      },
    ],
  },
  locked: { locked: true, savedCount: 7 },
};

/**
 * Hand-written translated views of every seeded message, keyed by message id
 * then target language, so the language toggle's translate-the-conversation
 * flow is fully demonstrable in preview with faithful text (in production the
 * backend generates and caches these).
 */
const PREVIEW_TRANSLATIONS: Record<string, Partial<Record<"ar" | "en", string>>> = {
  m1: { en: "Explain Newton's second law to me in a way I can understand, and give me an example from my own life." },
  m2: {
    en: `📝 Exam-ready answer

**Newton's second law of motion** states that the **rate of change of momentum** of a body is **directly proportional** to the **net force** acting on it, and the change happens **in the direction of the force**.

When the **mass is constant**, the relation reduces to:

$$\\vec{F}_{\\text{net}} = m\\vec{a}$$

**Key points:**
- $F$ is the net force, measured in newtons (N).
- $m$ is the body's mass, in kilograms (kg).
- $a$ is the resulting acceleration, in m/s².
- Force and acceleration are **vector quantities**, so direction matters.

---

📓 Understand it deeply

1. 🌟 The big idea
A force is not just a push, it is what *changes the motion* of a body: more force means more acceleration, and more mass means less acceleration.

2. 🤔 An example from your life
Picture two shopping trolleys, one **empty** and one **loaded with rice bags**, and push both **with the same effort**. The empty one shoots off, the loaded one barely moves. Same force, different acceleration, because the mass is different. That is Newton's second law in your hands.

3. 📖 Simple explanation
Force is what makes a body's speed change. The harder you push, the faster the speed changes, meaning a bigger acceleration. But the heavier the body, the more force it needs to accelerate by the same amount. That three-way relation is the whole law.

4. 🖼 Visual picture

\`\`\`mermaid
graph LR
    A["Force F"] --> C["a = F / m"]
    B["Mass m"] --> C
\`\`\`

| Quantity | Symbol | Unit |
|---|---|---|
| Force | F | N |
| Mass | m | kg |
| Acceleration | a | m/s² |

5. 🧠 Formal definition
For constant mass, the net force equals mass times acceleration:
$$F = m \\times a$$
One newton (1 N) is defined as the force that gives a 1 kg mass an acceleration of 1 m/s².

6. ✏ Worked example
A car of mass 1000 kg experiences a net force of 2000 N. Find its acceleration.
$$a = \\frac{F}{m} = \\frac{2000}{1000} = 2 \\ \\text{m/s}^2$$
**Check:** $F = m \\times a = 1000 \\times 2 = 2000$ N. Correct, and the units are consistent.

7. ⚠ Common mistakes
- Forgetting that the **net force** is what matters: add the forces (with direction) first, then apply the law.
- Treating force and acceleration as plain numbers; they are vectors, so direction is part of the answer.

8. 🎯 Quick check question
A football of mass 0.45 kg is kicked and gains an acceleration of 30 m/s². How much force did the foot apply?

9. 📌 One-line summary
For constant mass: force = mass x acceleration. More force, more acceleration; more mass, less acceleration.`,
  },
  m3: { ar: "ما زلت لا أفهمها تمامًا، هل يمكنك شرح هذا الجزء بطريقة مختلفة وأبسط؟" },
  m4: {
    en: `Of course, let us slow down and try a completely different angle. There is no rush at all.

Forget the formula for a moment. Let us just feel what happens.

**The core idea is one:**

> Force is what *changes* a body's motion. No force, no change. Bigger force, bigger change. Heavier body, smaller change.

That is everything. All the rest is just the mathematics of that one sentence.

**Think of kicking a football.** ⚽

You kick a **light plastic ball** and it flies off fast. Same kick, big change in motion. Then you kick a **heavy medicine ball** with the same kick, and it barely moves. Same force, but the mass changed the size of the acceleration.

- **Bigger force** leads to **bigger acceleration** (for the same mass)
- **Bigger mass** leads to **smaller acceleration** (for the same force)

That is the whole law. And F = ma is just a shorthand way of saying it.

Shall we try the football question now, or shall I walk you through a smaller example first?`,
  },
  n1: { ar: "ما الفرق بين الانقسام المتساوي والانقسام المنصّف؟ أستعدّ لامتحان الأحياء." },
  n2: {
    ar: `سؤال ممتاز، ومن الأسئلة المفضّلة في الامتحانات. إليك أوضح طريقة للتفريق بينهما.

**الانقسام المتساوي (Mitosis)** ينتج خليّتين جسميّتين متطابقتين (للنموّ والترميم). انقسام واحد، وعدد الكروموسومات يبقى كما هو: خليّة ثنائيّة المجموعة (2n) تعطي خليّتين ثنائيّتين (2n).

**الانقسام المنصّف (Meiosis)** ينتج أربع خلايا جنسيّة مختلفة وراثيًّا (الأمشاج). انقسامان، وعدد الكروموسومات ينصّف: خليّة ثنائيّة المجموعة (2n) تعطي أربع خلايا أحاديّة (n).

| الخاصيّة | الانقسام المتساوي | الانقسام المنصّف |
|---|---|---|
| عدد الانقسامات | واحد | اثنان |
| الخلايا الناتجة | 2 | 4 |
| عدد الكروموسومات | يبقى (2n) | ينصّف (n) |
| النتيجة الوراثيّة | متطابقة | متنوّعة (العبور الوراثي) |
| مكان الحدوث | الخلايا الجسميّة | الخلايا الجنسيّة |

**جملة للحفظ:** المتساوي للنسيج (النموّ)، والمنصّف للوراثة (الأمشاج).`,
  },
  i1: { ar: "لماذا يطفو الجليد على الماء؟" },
  i2: {
    ar: `لأنّ الجليد **أقلّ كثافةً** من الماء الذي يطفو عليه، وهذا أمر غير معتاد: فمعظم المواد تزداد كثافتها عندما تتجمّد.

عندما يتجمّد الماء، تترتّب جزيئاته في شبكة سداسيّة مفتوحة تثبّتها الروابط الهيدروجينيّة. هذا الترتيب يُبقي الجزيئات *أبعد عن بعضها* ممّا هي عليه في الماء السائل، فتشغل الكتلة نفسها حجمًا أكبر. كتلة أقلّ لكلّ وحدة حجم تعني كثافة أقلّ، وكلّ ما هو أقلّ كثافةً من الماء يطفو.

ولهذا تتجمّد البحيرات من الأعلى إلى الأسفل، لا العكس، وتبقى الأسماك حيّةً تحت الجليد طوال الشتاء.`,
  },
  q1: { ar: "كيف أجد جذور المعادلة التربيعيّة؟" },
  q2: {
    ar: `لأيّ معادلة تربيعيّة $ax^2 + bx + c = 0$ (بشرط $a \\neq 0$)، تأتي الجذور مباشرةً من القانون العامّ:

$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

المقدار الواقع تحت الجذر، $b^2 - 4ac$، يُسمّى **المميّز**. وهو يخبرك بنوع الجذور قبل أن تحلّ:

- $b^2 - 4ac > 0$: جذران حقيقيّان مختلفان
- $b^2 - 4ac = 0$: جذر حقيقيّ واحد مكرّر
- $b^2 - 4ac < 0$: جذران مركّبان

جرّبه على $x^2 - 5x + 6 = 0$: المميّز هو $25 - 24 = 1$، إذن $x = \\frac{5 \\pm 1}{2}$، أي $x = 3$ أو $x = 2$.`,
  },
};

/** Patch the api object in place with resolved mock data. */
export function installPreviewMocks(api: typeof ApiShape) {
  try {
    window.localStorage.setItem("clarify_token", "preview-token");
  } catch {
    /* ignore */
  }
  const s = scenario();
  const ok = <T,>(v: T) => Promise.resolve(v);

  api.me = () => ok({ user: MOCK_ACCOUNT });
  api.updateMe = () => ok({ user: MOCK_ACCOUNT });
  api.getSubscription = () => ok({ subscription: mockSubscription() });
  // BHD catalogue, mirroring the backend's. configured:false reflects the
  // dormant-billing pilot, so the plan chooser previews its "coming soon"
  // state. The plans cast skips the minor-unit amount field on purpose: the
  // modal never reads it, and this keeps the mock immune to its renaming.
  api.getPlans = () =>
    ok({
      plans: [
        { id: "starter", name: "Starter", price: 1.9, monthlyQueries: 100, blurb: "About three questions a day. Room to breathe for daily doubts." },
        { id: "regular", name: "Regular", price: 3.9, monthlyQueries: 300, blurb: "Ten a day: daily learning plus exam-season revision." },
        { id: "unlimited", name: "Unlimited", price: 5.9, monthlyQueries: null, blurb: "Never ration your curiosity, never count a question." },
      ] as PlansResponse["plans"],
      trial: { days: 7, dailyQueries: 10 },
      passDays: 30,
      configured: false,
      currency: "BHD",
    });
  api.listConversations = () => ok({ conversations: CONVERSATIONS });
  api.getMessages = (id: string) => ok({ messages: MESSAGES[id] || [] });
  // Language-toggle translated views. A short delay mimics the production
  // round-trip so the swap-in behavior is what a designer actually sees.
  api.translate = ({ target, items }) =>
    new Promise((resolve) =>
      setTimeout(() => {
        const translations: Record<string, string> = {};
        for (const it of items) {
          const hit = PREVIEW_TRANSLATIONS[it.id]?.[target];
          if (hit) translations[it.id] = hit;
        }
        resolve({ translations });
      }, 450)
    );
  api.createConversation = () =>
    ok({ conversation: { id: `c-new-${Date.now()}`, title: "New chat", messageCount: 0, updatedAt: NOW } });
  api.renameConversation = () => ok({} as any);
  api.deleteConversation = () => ok({} as any);
  api.addMessage = () => ok({} as any);
  api.deleteMessage = () => ok({} as any);
  api.getNotebook = () => ok(s === "locked" ? NOTEBOOK_SUMMARY.locked : NOTEBOOK_SUMMARY.default);
  api.getNotebookChapter = () =>
    ok({
      entries: [
        {
          id: "e1", messageId: "m2", conversationId: "c1",
          question: REAL_QUESTION,
          text: "For the same force, a body with smaller mass gets a larger acceleration, and vice versa.",
          createdAt: NOW,
        },
        {
          id: "e2", messageId: "m2", conversationId: "c1",
          question: REAL_QUESTION,
          text: "Force is the rate of change of momentum, and for constant mass, force equals mass times acceleration.",
          createdAt: NOW,
        },
      ],
      note: null,
    });
  api.saveNotebookEntry = () => ok({ ok: true, id: `e-${Date.now()}` });
  api.deleteNotebookEntry = () => ok({} as any);
  api.generateClarifyNotes = () =>
    ok({
      text: "**Newton's laws, revision sheet**\n\n1. Force is the rate of change of momentum. For constant mass this reduces to F = ma.\n2. Same force, smaller mass, larger acceleration.\n3. Always resolve to the *net* force before applying the law.",
      generatedAt: NOW,
      stale: false,
    });
}
