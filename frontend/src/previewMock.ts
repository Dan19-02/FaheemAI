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
import type { Account } from "./api";
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

const MOCK_ACCOUNT: Account = {
  id: 1,
  email: "alex@example.com",
  profile: {
    name: "Alex",
    board: "High School",
    grade: "Grade 11",
    language: "English",
    preferredAnalogy: "Daily Life",
    confidenceLevel: 3,
    examGoals: "Finally understand physics, not just memorise it.",
  },
  chapters: [
    { id: "ch-1", name: "Laws of Motion", mastery: "weak", confidenceScore: 25, lastStudied: "2026-07-05" },
    { id: "ch-2", name: "Rotational Motion", mastery: "weak", confidenceScore: 25, lastStudied: "2026-07-04" },
    { id: "ch-3", name: "Thermodynamics", mastery: "developing", confidenceScore: 50, lastStudied: "2026-07-03" },
    { id: "ch-4", name: "Organic Chemistry: GOC", mastery: "developing", confidenceScore: 50, lastStudied: "2026-07-02" },
    { id: "ch-5", name: "Integrals", mastery: "strong", confidenceScore: 85, lastStudied: "2026-07-01" },
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
    { id: "n1", role: "user", text: "What is the difference between mitosis and meiosis? I have a biology exam coming up.", timestamp: "6:00 PM" },
    {
      id: "n2", role: "model", timestamp: "6:00 PM",
      text: "An exam favourite. Here is the cleanest way to hold the two apart.\n\n**Mitosis** makes two identical body cells (growth, repair). One division, chromosome number stays the same: a diploid cell (2n) gives two diploid cells (2n).\n\n**Meiosis** makes four genetically different sex cells (gametes). Two divisions, chromosome number halves: a diploid cell (2n) gives four haploid cells (n).\n\n| Feature | Mitosis | Meiosis |\n|---|---|---|\n| Divisions | One | Two |\n| Daughter cells | 2 | 4 |\n| Chromosome number | Same (2n) | Halved (n) |\n| Genetic result | Identical | Varied (crossing over) |\n| Where | Body cells | Germ cells |\n\n**One-line memory hook:** mi**T**osis is for **T**issue (growth), me**I**osis is for **I**nheritance (gametes).",
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
        subject: "Physics", count: 5,
        chapters: [
          { chapter: "Laws of Motion", count: 3, latestAt: NOW },
          { chapter: "Rotational Motion", count: 2, latestAt: "2026-07-04T00:00:00.000Z" },
        ],
      },
      {
        subject: "Chemistry", count: 2,
        chapters: [{ chapter: "General Organic Chemistry", count: 2, latestAt: "2026-07-02T00:00:00.000Z" }],
      },
    ],
  },
  locked: { locked: true, savedCount: 7 },
};

/** Patch the api object in place with resolved mock data. */
export function installPreviewMocks(api: typeof ApiShape) {
  try {
    window.localStorage.setItem("faheem_token", "preview-token");
  } catch {
    /* ignore */
  }
  const s = scenario();
  const ok = <T,>(v: T) => Promise.resolve(v);

  api.me = () => ok({ user: MOCK_ACCOUNT });
  api.updateMe = () => ok({ user: MOCK_ACCOUNT });
  api.getSubscription = () => ok({ subscription: mockSubscription() });
  api.listConversations = () => ok({ conversations: CONVERSATIONS });
  api.getMessages = (id: string) => ok({ messages: MESSAGES[id] || [] });
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
  // Stateful on purpose: the second read shows the practiced concept as
  // landed, so the workspace's transition diff (and its mastery celebration)
  // can be seen in preview without waiting a real spaced day.
  // > 2 (not > 1): StrictMode double-invokes the mount effect in dev, so the
  // first two reads land within milliseconds of each other.
  let compReads = 0;
  api.getComprehension = () => {
    compReads++;
    const promoted = compReads > 2;
    const dayAgo = new Date(Date.now() - 864e5).toISOString();
    return ok({
      enabled: true,
      concepts: [
        {
          key: "newtons-second-law",
          label: "Newton's second law",
          chapter: "Laws of Motion",
          state: (promoted ? "landed" : "practiced") as "landed" | "practiced",
          struggles: 0,
          passes: promoted ? 2 : 1,
          lastSeen: NOW,
          firstSeen: dayAgo,
          lastPass: NOW,
        },
        { key: "friction-basics", label: "Friction", chapter: "Laws of Motion", state: "working_on_it" as const, struggles: 1, passes: 0, lastSeen: NOW, firstSeen: dayAgo, lastPass: null },
      ],
      summary: { landed: promoted ? 1 : 0, practiced: promoted ? 0 : 1, working: 1 },
      ready: promoted ? [] : [{ key: "newtons-second-law", label: "Newton's second law", chapter: "Laws of Motion", kind: "confirm" as const }],
      today: {
        learned: promoted ? [{ key: "newtons-second-law", label: "Newton's second law" }] : [],
        fuzzy: [{ key: "friction-basics", label: "Friction" }],
        touched: 2,
      },
    });
  };
  api.confirmCheck = () =>
    ok({
      question: "A loaded truck and an empty scooter both need to speed up by the same amount in the same time. Which one needs the bigger push, and why?",
      label: "Newton's second law",
    });
  api.getMeStats = () => ok({ daysActive: 4, activeToday: false, doubtsCleared: 12 });
  api.deleteNotebookEntry = () => ok({} as any);
  api.generateFaheemNotes = () =>
    ok({
      text: "**Laws of Motion, revision sheet**\n\n1. Force is the rate of change of momentum. For constant mass this reduces to F = ma.\n2. Same force, smaller mass, larger acceleration.\n3. Always resolve to the *net* force before applying the law.",
      generatedAt: NOW,
      stale: false,
    });
}
