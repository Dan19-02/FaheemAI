/**
 * Subscriptions, the free trial, and per-question metering.
 *
 * Billing model (decided 2026-07-03): a ONE-TIME MONTHLY PASS. A student pays
 * once through Razorpay and gets 30 days on that plan; when it lapses they pay
 * again. There is no auto-debit. The Razorpay wiring lives in billing.ts.
 *
 * The trial: every account joins on a 'trial' plan good for 7 days, with 10
 * questions a day (reset at midnight Bahrain time), never more. After the
 * trial they must hold an active paid pass to keep asking. Buying ANY plan
 * ends the free tier immediately and permanently (activatePlan clamps
 * trial_ends_at): from that moment the paid plan is the only quota.
 *
 * Metering: one *new* question costs one credit. Follow-ups in the same thread,
 * "still fuzzy" re-explains, "deep understanding" notebooks, and deep-checks are
 * all free, so being re-taught is never penalised. See meterNewQuestion.
 */
import crypto from "crypto";
import { type Queryable, getUserById, getUsage, chargeUsage } from "./db.js";

export type PlanId = "trial" | "starter" | "regular" | "unlimited";

export interface PlanDef {
  id: Exclude<PlanId, "trial">;
  name: string;
  price: number; // Bahraini dinar (BHD) per month, for display
  amountFils: number; // smallest unit a processor charges (1 BHD = 1000 fils)
  monthlyQueries: number | null; // null = unlimited
  blurb: string;
}

/** The three paid plans (must match the landing page PricingSection). */
export const PLANS: PlanDef[] = [
  { id: "starter", name: "Starter", price: 10, amountFils: 10_000, monthlyQueries: 100, blurb: "About three questions a day. Room to breathe for daily doubts." },
  { id: "regular", name: "Regular", price: 40, amountFils: 40_000, monthlyQueries: 300, blurb: "Serious study fuel: ten a day for daily learning and exam-season revision." },
  { id: "unlimited", name: "Unlimited", price: 100, amountFils: 100_000, monthlyQueries: null, blurb: "The whole catch-net. Never ration your curiosity." },
];

export const PLAN_BY_ID: Record<string, PlanDef> = Object.fromEntries(PLANS.map((p) => [p.id, p]));

export const TRIAL_DAYS = 7;
export const TRIAL_DAILY_QUERIES = 10;
export const PASS_DAYS = 30;
/** How close to expiry a pass must be before a re-buy is allowed (see renewalDecision). */
export const RENEW_WINDOW_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const BAHRAIN_OFFSET_MS = 3 * 60 * 60 * 1000; // Bahrain is UTC+3, no DST.

/** Today's calendar date in Bahrain (YYYY-MM-DD), so the daily reset is Bahrain midnight. */
export function bahrainDateKey(nowMs = Date.now()): string {
  return new Date(nowMs + BAHRAIN_OFFSET_MS).toISOString().slice(0, 10);
}

/** ISO timestamp of the next Bahrain midnight (when the daily trial quota refreshes). */
export function nextBahrainMidnight(nowMs = Date.now()): string {
  const shifted = new Date(nowMs + BAHRAIN_OFFSET_MS);
  shifted.setUTCHours(24, 0, 0, 0); // next midnight, read in the shifted (Bahrain) frame
  return new Date(shifted.getTime() - BAHRAIN_OFFSET_MS).toISOString();
}

export type SubState = "trial" | "active" | "trial_expired" | "plan_expired";

export interface Entitlement {
  plan: PlanId;
  planName: string;
  state: SubState;
  /** Can the student ask a new question at all right now (before the quota)? */
  active: boolean;
  limit: number | null; // questions allowed this period, null = unlimited
  used: number;
  remaining: number | null; // null = unlimited
  periodType: "day" | "pass" | "none";
  periodKey: string; // keys the usage counter; "" when there is no access
  resetAt: string | null; // ISO: when the window rolls over / access ends
  trialEndsAt: string | null;
  planExpiresAt: string | null;
}

function ms(v: any): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}
const iso = (v: number | null): string | null => (v ? new Date(v).toISOString() : null);
const remainingOf = (limit: number | null, used: number): number | null =>
  limit == null ? null : Math.max(0, limit - used);

/**
 * Resolve the current plan window for a raw user row and a known usage count.
 * Pure (no DB): getEntitlement below reads the usage first, then calls this.
 */
export function resolveEntitlement(row: any, used: number, nowMs = Date.now()): Entitlement {
  const planRaw = (row?.plan || "trial") as PlanId;
  const trialEnds = ms(row?.trial_ends_at);
  const planStarted = ms(row?.plan_started_at);
  const planExpires = ms(row?.plan_expires_at);
  const paidDef = PLAN_BY_ID[planRaw];

  const hasActivePaid = Boolean(paidDef && planExpires && nowMs < planExpires);
  const inTrial = Boolean(trialEnds && nowMs < trialEnds);

  // An active paid pass wins over a still-running trial (more generous).
  if (hasActivePaid) {
    const limit = paidDef.monthlyQueries;
    return {
      plan: planRaw,
      planName: paidDef.name,
      state: "active",
      active: true,
      limit,
      used,
      remaining: remainingOf(limit, used),
      periodType: "pass",
      periodKey: `p:${planStarted ?? planExpires}`,
      resetAt: iso(planExpires),
      trialEndsAt: iso(trialEnds),
      planExpiresAt: iso(planExpires),
    };
  }

  if (inTrial) {
    return {
      plan: "trial",
      planName: "Free trial",
      state: "trial",
      active: true,
      limit: TRIAL_DAILY_QUERIES,
      used,
      remaining: remainingOf(TRIAL_DAILY_QUERIES, used),
      periodType: "day",
      periodKey: `d:${bahrainDateKey(nowMs)}`,
      resetAt: nextBahrainMidnight(nowMs),
      trialEndsAt: iso(trialEnds),
      planExpiresAt: iso(planExpires),
    };
  }

  // No access: either the trial ran out (never paid) or a paid pass lapsed.
  const state: SubState = paidDef ? "plan_expired" : "trial_expired";
  return {
    plan: planRaw,
    planName: paidDef ? paidDef.name : "Free trial",
    state,
    active: false,
    limit: 0,
    used,
    remaining: 0,
    periodType: "none",
    periodKey: "",
    resetAt: null,
    trialEndsAt: iso(trialEnds),
    planExpiresAt: iso(planExpires),
  };
}

/** Read the entitlement for a user row, including how much of the window is used. */
export async function getEntitlement(q: Queryable, row: any, nowMs = Date.now()): Promise<Entitlement> {
  const base = resolveEntitlement(row, 0, nowMs);
  if (!base.periodKey) return base; // no access -> no counter to read
  const used = await getUsage(q, row.id, base.periodKey);
  return resolveEntitlement(row, used, nowMs);
}

/**
 * Pre-exam notebook access (user decision 2026-07-03): SAVING points is open
 * to every account, but VIEWING the notebook and generating Clarify notes
 * needs an active Regular or Unlimited pass. Trial and Starter save with
 * locked viewing; a lapsed pass read-locks the notebook (never deletes it)
 * until renewal.
 */
export function hasNotebookAccess(ent: Entitlement): boolean {
  return ent.state === "active" && (ent.plan === "regular" || ent.plan === "unlimited");
}

// ---- Renewal policy ----

export interface RenewalDecision {
  /** May a new pass be bought right now? */
  allowed: boolean;
  /** When the new pass would begin (chained onto the current one, never overwriting it). */
  startsAtMs: number;
  /** The current pass's expiry when one is still running, else null. */
  activeUntilMs: number | null;
}

/**
 * Decide whether the user may buy a pass right now, and when it would start.
 * A pass a student already paid for is never destroyed: while one is active,
 * buying is blocked until its last RENEW_WINDOW_DAYS, and a purchase made in
 * that window starts AT the current expiry (the windows chain back to back).
 * With no active pass (trial, expired trial, lapsed pass), it starts now.
 */
export function renewalDecision(row: any, nowMs = Date.now()): RenewalDecision {
  const planExpires = ms(row?.plan_expires_at);
  const hasActivePaid = Boolean(PLAN_BY_ID[row?.plan] && planExpires && nowMs < planExpires);
  if (!hasActivePaid) return { allowed: true, startsAtMs: nowMs, activeUntilMs: null };
  return {
    allowed: nowMs >= planExpires! - RENEW_WINDOW_DAYS * DAY_MS,
    startsAtMs: planExpires!,
    activeUntilMs: planExpires!,
  };
}

// ---- Metering ----

export type MeterReason = "no_access" | "quota";
export interface MeterResult {
  ok: boolean;
  reason?: MeterReason;
  entitlement: Entitlement;
}

// One "ask" can reach the server twice: the client tries /chat/stream first and,
// if that falls back, retries the same question on /chat. This short-lived map
// remembers a just-charged question so the paired retry passes through free.
// The TTL must outlive the LONGEST possible stream attempt (45s to first token
// plus minutes of generation with 30s idle re-arms), because the /chat retry
// only fires after the stream dies; 90s was measured too short. It is NOT a
// security control: an identical re-ask inside the window is served from the
// answer cache anyway, so no free generation is being given away. Server
// restarts clear it; the worst case is one rare re-charge.
const recentlyCharged = new Map<string, number>();
const DEDUP_TTL_MS = 10 * 60_000;

function dedupKey(userId: number, message: string): string {
  const h = crypto.createHash("sha1").update((message || "").toLowerCase().trim()).digest("hex");
  return `${userId}:${h}`;
}
function chargedRecently(userId: number, message: string): boolean {
  const exp = recentlyCharged.get(dedupKey(userId, message));
  return Boolean(exp && exp > Date.now());
}
function markCharged(userId: number, message: string): void {
  recentlyCharged.set(dedupKey(userId, message), Date.now() + DEDUP_TTL_MS);
}

// Every charged question adds a key that only the size-guard used to evict,
// so a long-lived process leaked the map slowly. Sweep expired entries on a
// timer instead; unref() keeps the timer from holding the process open.
setInterval(() => {
  const now = Date.now();
  for (const [key, expiresAt] of recentlyCharged) {
    if (expiresAt <= now) recentlyCharged.delete(key);
  }
}, 10 * 60_000).unref();

/**
 * Gate a NEW question and charge one credit. Callers must only invoke this for a
 * genuine new question (first message in a thread, not a deep dive). Returns
 * ok=false with a reason when the student is out of access or out of quota; the
 * entitlement is always returned so the client can refresh its usage display.
 */
export async function meterNewQuestion(q: Queryable, row: any, message: string): Promise<MeterResult> {
  const hasText = Boolean((message || "").trim());

  // Paired retry of a question we just charged (stream -> /chat fallback): let it
  // through without charging again and without re-checking the quota, because the
  // credit was already spent on the first call.
  if (hasText && chargedRecently(row.id, message)) {
    return { ok: true, entitlement: await getEntitlement(q, row) };
  }

  const ent = await getEntitlement(q, row);
  if (!ent.active) return { ok: false, reason: "no_access", entitlement: ent };

  // chargeUsage enforces the limit inside one atomic statement, so concurrent
  // requests can never overshoot the quota between a read and an increment.
  const newUsed = await chargeUsage(q, row.id, ent.periodKey, ent.limit);
  if (newUsed == null) {
    return { ok: false, reason: "quota", entitlement: resolveEntitlement(row, ent.limit ?? ent.used) };
  }
  if (hasText) markCharged(row.id, message);
  return { ok: true, entitlement: resolveEntitlement(row, newUsed) };
}

/** Convenience for the AI routes, which only carry the user id. */
export async function meterNewQuestionByUserId(
  q: Queryable,
  userId: number,
  message: string
): Promise<MeterResult> {
  const row = await getUserById(q, userId);
  if (!row) {
    // Should not happen (the JWT was valid), but fail closed rather than free.
    const empty = resolveEntitlement({ plan: "trial" }, 0);
    return { ok: false, reason: "no_access", entitlement: { ...empty, active: false, state: "trial_expired" } };
  }
  return meterNewQuestion(q, row, message);
}

/** A warm, student-facing sentence explaining why a question was blocked. */
export function paywallMessage(ent: Entitlement, reason: MeterReason): string {
  if (reason === "quota") {
    if (ent.state === "trial") {
      return "That is all 10 free questions for today. They refresh tomorrow morning, or you can unlock a plan to keep going right now.";
    }
    return `You have used all ${ent.limit} questions on your ${ent.planName} plan this month. Upgrade any time to keep learning.`;
  }
  if (ent.state === "plan_expired") {
    return `Your ${ent.planName} pass has ended. Renew it to pick up right where you left off.`;
  }
  return "Your free week is complete. Choose a plan to keep your patient teacher going, at any hour, as many times as you need.";
}
