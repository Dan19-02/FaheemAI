import type { StudentProfile, ChapterProgress, ChatMessage } from "./types";

/** The one and only support contact. Every "reach us" surface uses this.
 *  Interim address until a faheem domain mailbox exists. */
export const SUPPORT_EMAIL = "daanishmotivate@gmail.com";

// Intentionally empty. Students start with a clean Chapter Mastery list and
// add their own chapters. (No demo/prefilled data.)
export const DEFAULT_CHAPTERS: ChapterProgress[] = [];

export function makeDefaultProfile(name = "Student"): StudentProfile {
  return {
    name,
    board: "Bahrain MoE",
    grade: "Grade 10",
    language: "Arabic",
    preferredAnalogy: "Daily Life",
    confidenceLevel: 3,
    examGoals: "فهم المواد بعمق والاستعداد جيدًا للامتحانات.",
  };
}

export function makeWelcomeMessage(): ChatMessage {
  return {
    id: "welcome",
    role: "model",
    text:
      "🌟 مرحبًا بك! أنا فهيم (Faheem)، معلّمك الشخصي ورفيقك في التعلّم.\n\nأؤمن بأن لكل طالب إيقاعه وأسلوبه الخاص في التعلّم. مهما كان عدد أسئلتك أو مدى صعوبة الموضوع، سنستكشفه معًا خطوة بخطوة حتى تشعر: \"أخيرًا فهمت هذا.\"\n\nأخبرني، ما المفهوم الذي تودّ إتقانه اليوم؟ أم تفضّل اختيار أحد الفصول من سجل دراستك؟",
    // Deterministic format: bare toLocaleTimeString() varies by device locale.
    timestamp: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    mode: "standard",
  };
}
