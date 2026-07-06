export type StudyMode = "standard" | "thinking" | "search";

export interface GroundingSource {
  title: string;
  uri: string;
}

/** A file a student attaches to a message (image or document). */
export interface Attachment {
  dataUrl: string; // full data URL, e.g. "data:image/png;base64,...": used for display + upload
  mimeType: string;
  name: string;
  isImage: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: string;
  mode?: StudyMode;
  sources?: GroundingSource[];
  attachments?: Attachment[];
  audioBase64?: string; // Cache generated TTS audio
  isPlayingAudio?: boolean;
  /** Deep-check state for this answer (present only when it was requested):
   *  "checking" = examiner reviewing the streamed draft (transient, client
   *  only); "passed" = the examiner pass ran; "unavailable" = it could not
   *  run, so the answer is shown unverified and the UI says so. */
  verification?: "checking" | "passed" | "unavailable";
  /** Curriculum grounding (Fahim): the MoE/curriculum unit this answer was
   *  built from, surfaced as a source chip so trust is visible. */
  grounding?: { unitTitle: string; section: string; level: string; groundednessScore: number };
  /** True when the question fell outside the grade's textbook coverage (the
   *  answer, if any, is general knowledge, not from the curriculum). */
  outOfSyllabus?: boolean;
  /** True while this bubble is receiving a live streamed draft (client only:
   *  rendered as plain markdown, action buttons hidden until complete). */
  streaming?: boolean;
  /** A gentle, self-blaming failure notice (client only): rendered on a faint
   *  stone ground, distinct from a real white answer, with no warning color. */
  isError?: boolean;
}

/** A separate chat window / study session. */
export interface Conversation {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

export interface ChapterProgress {
  id: string;
  name: string;
  mastery: "weak" | "developing" | "strong";
  confidenceScore: number; // 0 to 100
  lastStudied: string;
}

/** The student's plan + live usage, resolved by the backend on every request. */
export interface Subscription {
  plan: "trial" | "starter" | "regular" | "unlimited";
  planName: string;
  state: "trial" | "active" | "trial_expired" | "plan_expired";
  /** Can a new question be asked right now (before checking remaining)? */
  active: boolean;
  limit: number | null; // questions this period, null = unlimited
  used: number;
  remaining: number | null; // null = unlimited
  periodType: "day" | "pass" | "none";
  resetAt: string | null; // ISO: when the quota refreshes / access ends
  trialEndsAt: string | null;
  planExpiresAt: string | null;
}

// ---- Pre-exam notebook ----

/** One saved point: the exact lines a student selected from an answer. */
export interface NotebookEntry {
  id: string;
  messageId: string | null;
  conversationId: string | null;
  question: string;
  text: string;
  createdAt: string;
}

export interface NotebookChapter {
  chapter: string;
  count: number;
  latestAt: string;
}

export interface NotebookSubject {
  subject: string;
  count: number;
  chapters: NotebookChapter[];
}

/** The shelf. locked=true comes with only savedCount (trial/Starter/lapsed). */
export interface NotebookSummary {
  locked: boolean;
  savedCount: number;
  subjects?: NotebookSubject[];
}

export interface ClarifyNote {
  text: string;
  generatedAt: string;
  stale: boolean;
  cached?: boolean;
}

export interface StudentProfile {
  name: string;
  board: string; // Bahrain MoE, CBSE, Cambridge
  grade: string; // Grade 9 - Grade 12
  language: string; // Arabic, English
  preferredAnalogy: string; // Daily Life, Sports, Cooking, Bicycles & Trains, Mobile Phones & Tech, Games
  weakChapters?: string[];
  strongChapters?: string[];
  confidenceLevel: number; // 1 - 5 stars
  examGoals: string;
}
