/**
 * The celebration system: Faheem's honest dopamine layer.
 *
 * Rules (non-negotiable, they keep the calm brand intact):
 * - A mastery celebration fires ONLY on an examiner-verified mastery transition
 *   (practiced/landed) observed from the server's comprehension read. Never on
 *   a self-reported "got it".
 * - Failure is never celebrated, colored red, or scored. It simply is not here.
 * - Session caps keep it special: at most 4 mastery moments and 7 celebrations
 *   total per browser session, then the app goes quietly back to work.
 * - Each distinct moment fires ONCE ever per account (localStorage claims), so
 *   a reload never replays yesterday's win.
 * - No em or en dashes anywhere (app-wide punctuation rule).
 */

export type CelebrationTone = "practiced" | "landed" | "milestone" | "sheet";

export interface Celebration {
  tone: CelebrationTone;
  title: string;
  sub?: string;
  conceptKey?: string;
}

// ---- Session caps ----------------------------------------------------------

const MASTERY_SESSION_CAP = 4;
const TOTAL_SESSION_CAP = 7;
let masteryFired = 0;
let totalFired = 0;

/** May a celebration of this tone still fire this session? */
export function canFire(tone: CelebrationTone): boolean {
  if (totalFired >= TOTAL_SESSION_CAP) return false;
  if ((tone === "practiced" || tone === "landed") && masteryFired >= MASTERY_SESSION_CAP) return false;
  return true;
}

export function markFired(tone: CelebrationTone): void {
  totalFired++;
  if (tone === "practiced" || tone === "landed") masteryFired++;
}

/** One-shot localStorage claim: returns true the FIRST time a key is claimed,
 *  false ever after. Storage failures fail open (celebrate rather than dedupe:
 *  a rare repeat beats a swallowed win). */
export function claimOnce(key: string): boolean {
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}

// ---- Milestone ladders ------------------------------------------------------

export const DOUBT_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];
export const SAVE_MILESTONES = [10, 25, 50, 100, 200];
export const SHEET_THRESHOLDS = [10, 25, 50];

// ---- Copy bank --------------------------------------------------------------

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** A first graded pass: the concept is practiced. The sub line plants
 *  tomorrow's confirm at the peak of the moment. */
export function practicedCopy(label: string): { title: string; sub: string } {
  return {
    // Avoid the word "landed" here: that is reserved for the confirmed state.
    title: pick([`That clicked! ${label} ✨`, `Got it: ${label} ✨`]),
    sub: "Confirm it tomorrow and it is yours for good.",
  };
}

/** The big one: a second pass on a later day. Spaced, examiner-verified. */
export function landedCopy(label: string): { title: string; sub: string } {
  return {
    title: `LANDED: ${label} 🌟`,
    sub: "Right on two different days. This one is truly yours now.",
  };
}

/** A trial student's very first verified win: their First Star. */
export function firstStarCopy(label: string): { title: string; sub: string } {
  return { title: `⭐ Your first star! ${label} landed.`, sub: "Confirm it tomorrow and it is yours for good." };
}

export function doubtsMilestoneCopy(n: number): { title: string; sub: string } {
  return { title: `${n} doubts cleared 🎉`, sub: "Every one of them took the courage to ask." };
}

export function savesMilestoneCopy(n: number): { title: string; sub: string } {
  return { title: `${n} points in your notebook 📒`, sub: "On exam day they are all in one place, waiting." };
}

export function sheetCopy(subject: string, chapter: string, n: number): { title: string; sub: string } {
  return { title: `${chapter}: revision sheet ready 📄`, sub: `${n} points saved in this ${subject} chapter. Open Faheem notes in your notebook.` };
}

/** The save-lines running-count toast (a toast, not an overlay). */
export function savedToast(n: number): string {
  return `+1 · ${n} points saved · all in one place on exam day`;
}

/** The lamp greeting on the day's first answer. Counts the days a student
 *  showed up. There is no streak to break: a quiet day simply is not counted,
 *  it never subtracts. (We avoid promising the number can never move, since it
 *  is derived from the study log the student themselves can prune.) */
export function lampGreeting(daysActive: number): string {
  return `💡 Day ${daysActive}: you showed up. That is the real win.`;
}

export function lampTitle(daysActive: number, activeToday: boolean): string {
  const base = `${daysActive} days you showed up. Miss a day and nothing is taken away.`;
  if (activeToday) return base;
  return base + " Ask anything today to light the lamp.";
}
