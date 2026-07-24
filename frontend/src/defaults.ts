import type { StudentProfile, ChapterProgress } from "./types";

/** The one and only support contact. Every "reach us" surface uses this. */
export const SUPPORT_EMAIL = "support@faheem.ai";

// Intentionally empty. Students start with a clean Chapter Mastery list and
// add their own chapters. (No demo/prefilled data.)
export const DEFAULT_CHAPTERS: ChapterProgress[] = [];

export function makeDefaultProfile(name = "Student"): StudentProfile {
  return {
    name,
    board: "General",
    grade: "11th Grade",
    language: "English",
    preferredAnalogy: "Daily Life",
    confidenceLevel: 3,
    examGoals: "Ace my exams and build deep conceptual clarity!",
  };
}
