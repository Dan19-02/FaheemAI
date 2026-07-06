import type { StudentProfile, ChapterProgress, ChatMessage } from "./types";

/** The one and only support contact. Every "reach us" surface uses this. */
export const SUPPORT_EMAIL = "support@clarifyai.in";

// Intentionally empty. Students start with a clean Chapter Mastery list and
// add their own chapters. (No demo/prefilled data.)
export const DEFAULT_CHAPTERS: ChapterProgress[] = [];

export function makeDefaultProfile(name = "Student"): StudentProfile {
  return {
    name,
    board: "CBSE",
    grade: "11th Grade",
    language: "Hinglish",
    preferredAnalogy: "Daily Life",
    confidenceLevel: 3,
    examGoals: "Crack board exams and build deep conceptual clarity!",
  };
}

export function makeWelcomeMessage(): ChatMessage {
  return {
    id: "welcome",
    role: "model",
    text:
      "🌟 Hello there! I am Clarify.AI, your warm personal teacher and learning companion.\n\nI believe that every student has their own unique pace and style of learning. No matter how many questions you have or how complex a topic seems, we will explore it together step-by-step until you feel: \"I finally understand this.\"\n\nTell me, what concept would you like to master today? Or would you like to pick one of the chapters from your Study Log?",
    timestamp: new Date().toLocaleTimeString(),
    mode: "standard",
  };
}
