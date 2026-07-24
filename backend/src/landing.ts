/**
 * The Landing Signal: how Faheem tells whether a concept has LANDED for a
 * student, from what they do after an answer, without ever falsely claiming
 * "you understood this".
 *
 * Design (adversarially pressure-tested, 2026-07-11):
 * - The answering model appends ONE hidden marker per quick-mode reply
 *   (⟦FHM ...⟧) classifying the student's next action about the PREVIOUS
 *   concept and tagging THIS answer's concept + the check it poses. The server
 *   strips it before the student ever sees it (parseTrailer).
 * - ASYMMETRY is the whole point. Every negative (Still-fuzzy tap, examiner
 *   FAIL, a confused re-ask) is trusted immediately: the worst case is
 *   re-teaching something known, which is exactly the catch-net. A student-
 *   visible POSITIVE / a concept reaching "landed" requires a PASS on a
 *   TRANSFER check, graded by the SEPARATE skeptical examiner (not the warm
 *   tutor), and only becomes "landed" after a SECOND pass on a later day.
 * - Everything ambiguous (topic switch, silence, bare "thanks", an echoed
 *   answer) is recorded as unconfirmed and never shown as understanding.
 */
import type { Queryable } from "./db.js";
import {
  recordComprehensionEvent,
  upsertConceptMastery,
  getConceptMastery,
  type ConceptMasteryRow,
  type LandingVerdict,
} from "./db.js";
import { gradeStudentCheck, canonicalizeConcept, type CheckGrade } from "./knowledge.js";
import { utcDateKey } from "./subscription.js";

export interface Trailer {
  prev: string | null;
  intent: "answers_check" | "deeper" | "stuck" | "new_topic" | "affirmation" | "other";
  echo: boolean;
  newKey: string | null;
  label: string | null;
  chap: string | null;
  check: "transfer" | "recall" | "binary" | "none";
}

/** Extract and strip the trailing ⟦FHM ...⟧ marker. Returns the marker fields
 *  and the reply with the marker removed. Tolerant of missing/reordered
 *  fields: a malformed marker fails open to null (no positive is ever minted
 *  from a marker we could not parse). */
const FIELD_RX = Object.fromEntries(
  ["prev", "intent", "echo", "new", "label", "chap", "check"].map((name) => [
    name,
    { quoted: new RegExp(name + '="([^"]*)"'), bare: new RegExp(name + "=([^\\s⟧]+)") },
  ])
) as Record<string, { quoted: RegExp; bare: RegExp }>;

export function parseTrailer(text: string): { trailer: Trailer | null; cleaned: string } {
  if (!text) return { trailer: null, cleaned: text };
  // The marker is the last ⟦FHM ... ⟧ block; strip everything from it on.
  const m = text.match(/⟦FHM\b[\s\S]*?⟧\s*$/);
  if (!m) return { trailer: null, cleaned: text };
  const raw = m[0];
  const cleaned = text.slice(0, m.index).replace(/\s+$/, "");
  const field = (name: string): string | null => {
    // key="quoted value" OR key=barevalue (precompiled per field name: this
    // parser runs on every quick-mode answer).
    const rx = FIELD_RX[name];
    const q = raw.match(rx.quoted);
    if (q) return q[1].trim();
    const b = raw.match(rx.bare);
    return b ? b[1].trim() : null;
  };
  const none = (v: string | null): string | null => (!v || v.toLowerCase() === "none" ? null : v);
  const intentRaw = (field("intent") || "other").toLowerCase();
  const intent = (["answers_check", "deeper", "stuck", "new_topic", "affirmation", "other"].includes(intentRaw)
    ? intentRaw
    : "other") as Trailer["intent"];
  const checkRaw = (field("check") || "none").toLowerCase();
  const check = (["transfer", "recall", "binary", "none"].includes(checkRaw) ? checkRaw : "none") as Trailer["check"];
  return {
    trailer: {
      prev: none(field("prev")),
      intent,
      echo: field("echo") === "1",
      newKey: none(field("new")),
      label: none(field("label")),
      chap: none(field("chap")),
      check,
    },
    cleaned,
  };
}

// The check a conversation's last answer posed, remembered in memory (like the
// billing dedup map): so when the student answers it next turn we know its
// concept and kind. Volatile by design; losing it on restart costs at most one
// turn of grading, never a wrong positive.
interface PosedCheck {
  conceptKey: string;
  label: string | null;
  chap: string | null;
  kind: Trailer["check"];
  at: number;
  /** The exact question text when the SERVER posed it (the Ready-to-Land
   *  confirm flow); model-posed checks have none and grade against the label. */
  question?: string | null;
}
const posedChecks = new Map<string, PosedCheck>();
const POSED_TTL_MS = 30 * 60_000;

export function rememberPosedCheck(conversationId: string | null, t: Trailer): void {
  if (!conversationId || !t.newKey || t.check === "none") return;
  console.log(`[LANDING] remembered check "${t.newKey}" kind=${t.check} on conv ${conversationId}`);
  posedChecks.set(conversationId, {
    conceptKey: t.newKey,
    label: t.label,
    chap: t.chap,
    kind: t.check,
    at: Date.now(),
  });
  if (posedChecks.size > 5000) {
    const now = Date.now();
    for (const [k, v] of posedChecks) if (now - v.at > POSED_TTL_MS) posedChecks.delete(k);
  }
}

/** The Ready-to-Land confirm flow poses its own transfer check (a real
 *  question the server generated), so grading never depends on the model
 *  emitting a trailer. Same map, same TTL, same gold grading path. */
export function rememberServerPosedCheck(
  conversationId: string,
  check: { conceptKey: string; label: string | null; chap: string | null; question: string }
): void {
  console.log(`[LANDING] server posed confirm check "${check.conceptKey}" on conv ${conversationId}`);
  posedChecks.set(conversationId, {
    conceptKey: check.conceptKey,
    label: check.label,
    chap: check.chap,
    kind: "transfer",
    at: Date.now(),
    question: check.question,
  });
}

/** Is a practiced concept eligible for its later-day confirmation right now?
 *  Uses the SAME day comparison as the landed promotion in recordLanding, so a
 *  concept offered as "ready" can actually reach landed on a PASS today. */
export function isSpacedReady(lastPassAt: string | null, now = new Date()): boolean {
  return !sameDay(lastPassAt, now);
}

/** The forgetting-curve ladder: a landed concept gets one gentle re-check at
 *  3, 7, and 21 days after its latest pass, then rests for good. */
export const REVIEW_INTERVAL_DAYS = [3, 7, 21] as const;

export function reviewDueIso(stage: number, nowMs = Date.now()): string | null {
  const days = REVIEW_INTERVAL_DAYS[stage];
  return days ? new Date(nowMs + days * 24 * 60 * 60 * 1000).toISOString() : null;
}

/** Shared eligibility for the Ready-to-Land queue and the confirm endpoint:
 *  "confirm" = practiced, one pass on an earlier day (a PASS today lands it);
 *  "refresh" = landed, its forgetting-curve re-check has come due.
 *  Null = not offerable right now. */
export function confirmKind(
  row: Pick<ConceptMasteryRow, "state" | "last_pass_at" | "next_review_at">,
  now = new Date()
): "confirm" | "refresh" | null {
  if (!row.last_pass_at || !isSpacedReady(row.last_pass_at, now)) return null;
  if (row.state === "practiced") return "confirm";
  if (row.state === "landed" && row.next_review_at && new Date(row.next_review_at).getTime() <= now.getTime())
    return "refresh";
  return null;
}

function getPosedCheck(conversationId: string | null): PosedCheck | null {
  if (!conversationId) return null;
  const c = posedChecks.get(conversationId);
  if (!c) return null;
  if (Date.now() - c.at > POSED_TTL_MS) {
    posedChecks.delete(conversationId);
    return null;
  }
  return c;
}

// "Same day" for the spaced-confirmation rule uses the same UTC calendar-day
// boundary every other day in this product uses (trial reset, streak, usage
// counters), via the shared utcDateKey, so all day windows roll together.
function sameDay(aIso: string | null, now = new Date()): boolean {
  if (!aIso) return false;
  return utcDateKey(new Date(aIso).getTime()) === utcDateKey(now.getTime());
}

export interface RecordLandingArgs {
  q: Queryable;
  userId: number;
  conversationId: string | null;
  message: string;
  isStillFuzzyTap: boolean;
  trailer: Trailer | null;
}

/**
 * Apply the Landing Signal for one follow-up turn. Never throws into the
 * request path (callers wrap it in a background catch). Order of trust:
 *   1. deterministic Still-fuzzy tap  -> not_understood
 *   2. examiner-graded transfer check -> the ONLY path to a positive
 *   3. model-reported intent          -> negatives trusted, positives internal-only
 * Then remembers this turn's posed check for the next turn.
 */
export async function recordLanding(args: RecordLandingArgs): Promise<void> {
  const { q, userId, conversationId, message, isStillFuzzyTap, trailer } = args;
  const posed = getPosedCheck(conversationId);
  // Which concept does a verdict about the PREVIOUS answer attach to? Prefer
  // the server-remembered posed check (most reliable), else the model's echo
  // of the previous concept key.
  const prevKey = posed?.conceptKey || trailer?.prev || null;
  const prevLabel = posed?.label || null;
  const prevChap = posed?.chap || null;

  const emit = async (
    verdict: LandingVerdict,
    confidence: "high" | "medium" | "low",
    trigger: string,
    source: "tap" | "check" | "inferred" | "self_report",
    patch: Parameters<typeof upsertConceptMastery>[3]
  ) => {
    if (!prevKey) return;
    console.log(`[LANDING] ${trigger} -> ${verdict}/${confidence} on "${prevKey}"`);
    await recordComprehensionEvent(q, {
      userId,
      conversationId,
      conceptKey: prevKey,
      conceptLabel: prevLabel,
      chapterTag: prevChap,
      triggerType: trigger,
      verdict,
      confidence,
      source,
    });
    await upsertConceptMastery(q, userId, prevKey, { conceptLabel: prevLabel, chapterTag: prevChap, lastVerdict: verdict, ...patch });
  };

  // A negative never erases a spaced-confirmed 'landed'; it just logs the event
  // and bumps struggle so the UI can surface "worth another look". For a landed
  // concept the next forgetting-curve re-check also moves out a few days, so a
  // hard day never turns into a daily nag.
  const demoteUnlessLanded = async (): Promise<Parameters<typeof upsertConceptMastery>[3]> => {
    const cur = prevKey ? await getConceptMastery(q, userId, prevKey) : null;
    const landed = cur?.state === "landed";
    return {
      incStruggle: 1,
      state: landed ? "landed" : "working_on_it",
      ...(landed ? { nextReviewAt: reviewDueIso(0) } : {}),
    };
  };

  try {
    // 1) Deterministic negative.
    if (isStillFuzzyTap) {
      await emit("not_understood", "high", "still_fuzzy", "tap", await demoteUnlessLanded());
      return; // sentinel carries no new concept/check to remember
    }

    // 2) Gold path, SERVER-DRIVEN so it never depends on the model reliably
    //    emitting the turn's marker. If we remember posing a TRANSFER check on
    //    this conversation and the student typed a substantive, non-echo reply,
    //    grade it: the skeptical examiner returns SKIP when the message is not
    //    actually an attempt (they moved on), so a non-attempt records nothing.
    const looksLikeAttempt = posed?.kind === "transfer" && !(trailer?.echo) && message.trim().length >= 8;
    if (posed && looksLikeAttempt) {
      const grade: CheckGrade | null = await gradeStudentCheck(
        posed.label || posed.conceptKey,
        posed.question || (posed.label ? `A transfer check on: ${posed.label}` : "A transfer check the tutor posed"),
        message
      );
      // A definitive grade CONSUMES the posed check: without this, the same
      // check would re-grade against every later message in the conversation,
      // and a second same-day "pass" would flip a just-earned landed back to
      // practiced. SKIP/null keep it (they have not attempted it yet).
      if (grade === "pass" || grade === "partial" || grade === "fail") {
        if (conversationId) posedChecks.delete(conversationId);
      }
      if (grade === "pass") {
        const cur = await getConceptMastery(q, userId, prevKey!);
        const priorPass = cur?.probed_pass_count ?? 0;
        const spaced = priorPass >= 1 && !sameDay(cur?.last_pass_at ?? null);
        // First pass -> practiced. A later-day second pass -> landed. A pass on
        // something already landed stays landed (never regress a real win).
        const wasLanded = cur?.state === "landed";
        const nextState = spaced || wasLanded ? "landed" : "practiced";
        // Forgetting curve: a fresh landing schedules the first re-check (+3d).
        // A pass on an already-landed concept climbs the ladder (7d, 21d, rest)
        // ONLY when its scheduled re-check was actually due: an organic extra
        // pass minutes after landing must not fast-forward the spacing.
        const reviewDue =
          wasLanded && !!cur?.next_review_at && new Date(cur.next_review_at).getTime() <= Date.now();
        const stage = wasLanded ? (cur?.review_stage ?? 0) + 1 : 0;
        await emit("understood", "high", "check_pass", "check", {
          incProbedPass: 1,
          state: nextState,
          stampPassNow: true,
          ...(nextState === "landed" && (!wasLanded || reviewDue)
            ? { reviewStage: stage, nextReviewAt: reviewDueIso(stage) }
            : {}),
        });
        return;
      }
      if (grade === "partial") {
        // Partial keeps the never-demote-landed rule: a twice-verified win is
        // not erased by one wobbly retention answer, it just re-checks sooner.
        const cur = await getConceptMastery(q, userId, prevKey!);
        const landed = cur?.state === "landed";
        await emit("partial", "high", "check_partial", "check", {
          state: landed ? "landed" : "working_on_it",
          ...(landed ? { nextReviewAt: reviewDueIso(0) } : {}),
        });
        return;
      }
      if (grade === "fail") {
        await emit("not_understood", "high", "check_fail", "check", await demoteUnlessLanded());
        return;
      }
      // grade === "skip" or null: not an attempt / grading unavailable ->
      // fall through to the model's intent (fail-open, never a positive).
    }

    if (trailer) {
      // 3) Model-reported intent. Negatives trusted; positives internal only.
      switch (trailer.intent) {
        case "stuck":
          await emit("not_understood", "medium", "stuck", "inferred", await demoteUnlessLanded());
          break;
        case "deeper":
          // Strongest NATURAL positive, but a kid can parrot the frame: record
          // it internally (never promotes a state, never shown as understood).
          if (!trailer.echo) {
            await emit("understood", "medium", "deeper", "inferred", { incInferredPass: 1 });
          } else {
            await emit("unconfirmed", "low", "deeper", "inferred", {});
          }
          break;
        case "affirmation":
          await emit("unconfirmed", "low", "affirmation_only", "self_report", {});
          break;
        case "answers_check":
          // Answered a check but not a gradeable transfer pass (recall/binary,
          // echo, too short, or grading unavailable): never a positive.
          await emit("unconfirmed", "low", trailer.echo ? "check_echoed" : "answers_check", "inferred", {});
          break;
        case "new_topic":
        case "other":
        default:
          // Ambiguous for the previous concept: close it unconfirmed.
          await emit("unconfirmed", "low", "new_topic", "inferred", {});
          break;
      }
    }
  } catch (e: any) {
    console.warn(`[LANDING] recordLanding failed (non-fatal): ${e?.message || e}`);
  } finally {
    // Remember THIS turn's posed check for next turn, regardless of the above.
    if (trailer) rememberPosedCheck(conversationId, trailer);
    // Shadow canonical id, in the background (recordLanding already runs after
    // the response; canonicalizeConcept never throws and fails open).
    if (prevKey) void canonicalizeConcept(q, userId, prevKey, prevLabel);
  }
}
