/**
 * The plan chooser + paywall. Opens when a student runs out of trial / quota,
 * or any time they tap the usage pill to upgrade. Purchases run through Razorpay
 * Checkout (see billing.ts); on success the caller gets the fresh subscription.
 *
 * Calm, honest, no urgency theatre, in keeping with the brand: no countdowns, no
 * fake discounts. It simply states where the student stands and what each plan
 * gives.
 */
import { useState } from "react";
import { X, Check, Loader2, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Account } from "./api";
import type { Subscription } from "./types";
import { startCheckout } from "./billing";
import { SUPPORT_EMAIL } from "./defaults";

interface UiPlan {
  id: "starter" | "regular" | "unlimited";
  name: string;
  price: number;
  queries: string;
  note: string;
  /** Tier-exclusive capability line (the Pre-exam notebook). */
  perk?: string;
  featured: boolean;
}

// Mirrors the backend catalogue (subscription.ts) and the landing PricingSection.
const NOTEBOOK_PERK = "Pre-exam notebook: save the lines that click, auto-filed by chapter, with Clarify notes for revision.";
const UI_PLANS: UiPlan[] = [
  { id: "starter", name: "Starter", price: 199, queries: "100 questions a month", note: "About three questions a day. Room to breathe for daily doubts.", featured: false },
  { id: "regular", name: "Regular", price: 499, queries: "300 questions a month", note: "Ten a day: daily learning plus exam-season revision.", perk: NOTEBOOK_PERK, featured: false },
  { id: "unlimited", name: "Unlimited", price: 999, queries: "Unlimited questions", note: "Never ration your curiosity, never count a question.", perk: NOTEBOOK_PERK, featured: true },
];

const INCLUDED = [
  "All boards: CBSE, ICSE, State, JEE, NEET",
  "English, Hinglish and Hindi",
  "Exam-ready answers + the nine-part notebook",
  "Deep-check examiner pass",
  "Photo doubts and voice sessions",
];

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  account: Account;
  subscription?: Subscription;
  /** A blocked-question message to show at the top (empty when opened manually). */
  reason?: string;
  onActivated: (sub: Subscription) => void;
}

function statusLine(sub?: Subscription): string {
  if (!sub) return "";
  if (sub.state === "trial") {
    const left = sub.remaining ?? 0;
    return `Free trial: ${left} question${left === 1 ? "" : "s"} left today.`;
  }
  if (sub.state === "active") {
    const left = sub.remaining;
    return left == null
      ? `You are on ${sub.planName}, with unlimited questions.`
      : `You are on ${sub.planName}: ${left} question${left === 1 ? "" : "s"} left this month.`;
  }
  if (sub.state === "plan_expired") return `Your ${sub.planName} pass has ended.`;
  return "Your free week is complete.";
}

// Mirrors backend subscription.ts: while a pass is active, buying is blocked
// until its last days; a renewal bought then STARTS AT the current expiry, so
// no paid day is ever lost.
const RENEW_WINDOW_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export default function UpgradeModal({ open, onClose, account, subscription, reason, onActivated }: UpgradeModalProps) {
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const expiresMs = subscription?.planExpiresAt ? Date.parse(subscription.planExpiresAt) : null;
  const passActive = subscription?.state === "active" && expiresMs != null && expiresMs > Date.now();
  // Mid-pass: purchases are locked (the server also enforces this with a 409).
  const renewLocked = passActive && expiresMs! - Date.now() > RENEW_WINDOW_DAYS * DAY_MS;
  const passEndsOn = expiresMs
    ? new Date(expiresMs).toLocaleDateString("en-IN", { day: "numeric", month: "long" })
    : "";

  const buy = async (planId: string) => {
    setError(null);
    setBusyPlan(planId);
    try {
      await startCheckout(planId, account, {
        onSuccess: (sub) => {
          setBusyPlan(null);
          onActivated(sub);
        },
        onDismiss: () => setBusyPlan(null),
        onError: (msg) => {
          setBusyPlan(null);
          setError(msg);
        },
      });
    } catch (err: any) {
      setBusyPlan(null);
      setError(err?.message || "Could not start the payment. Please try again.");
    }
  };

  const status = statusLine(subscription);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1e1e1a]/50 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.98, opacity: 0 }}
            className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-editorial-line bg-editorial-ivory p-6 shadow-xl md:p-9"
            role="dialog"
            aria-modal="true"
            aria-label="Choose a plan"
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-editorial-line text-editorial-charcoal/50 transition-colors hover:bg-editorial-stone hover:text-editorial-charcoal"
            >
              <X size={16} />
            </button>

            <div className="max-w-2xl">
              <h2 className="font-serif text-[clamp(1.6rem,4vw,2.4rem)] italic leading-tight tracking-[-0.01em] text-editorial-charcoal">
                Keep your patient teacher going.
              </h2>
              {reason ? (
                <p className="mt-3 rounded-2xl border border-editorial-line-light bg-white px-4 py-3 text-sm leading-relaxed text-editorial-charcoal/80">
                  {reason}
                </p>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-editorial-charcoal/70">
                  One question is one question answered. Re-explaining, deep dives, and deep-checks are always free.
                </p>
              )}
              {status && <p className="mt-2 text-xs font-medium text-editorial-sage">{status}</p>}
            </div>

            <div className="mt-7 grid gap-4 md:grid-cols-3">
              {UI_PLANS.map((plan) => {
                const isCurrent = subscription?.state === "active" && subscription.plan === plan.id;
                const busy = busyPlan === plan.id;
                return (
                  <div
                    key={plan.id}
                    className={`flex flex-col rounded-3xl p-6 ${
                      plan.featured ? "bg-night text-chalk" : "border border-editorial-line bg-white text-editorial-charcoal"
                    }`}
                  >
                    <h3 className={`font-serif text-lg italic ${plan.featured ? "text-sage-bright" : "text-editorial-sage"}`}>
                      {plan.name}
                    </h3>
                    <p className="mt-3 flex items-baseline gap-1.5">
                      <span className="font-serif text-4xl italic tracking-tight">₹{plan.price}</span>
                      <span className={`text-xs ${plan.featured ? "text-chalk-dim" : "text-editorial-charcoal/60"}`}>/ month</span>
                    </p>
                    <p className="mt-3 text-sm font-semibold">{plan.queries}</p>
                    <p className={`mt-1.5 text-xs leading-relaxed ${plan.featured ? "text-chalk-dim" : "text-editorial-charcoal/65"}`}>
                      {plan.note}
                    </p>
                    <div className="flex-1">
                      {plan.perk && (
                        <p className={`mt-2 text-xs font-medium leading-relaxed ${plan.featured ? "text-sage-bright" : "text-editorial-sage"}`}>
                          {plan.perk}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => buy(plan.id)}
                      disabled={busy || busyPlan !== null || renewLocked}
                      className={`mt-5 flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 ${
                        plan.featured ? "bg-sage-bright text-night" : "bg-editorial-charcoal text-white"
                      }`}
                    >
                      {busy ? (
                        <>
                          <Loader2 size={14} className="animate-spin" /> Opening…
                        </>
                      ) : isCurrent ? (
                        <>Renew ₹{plan.price}</>
                      ) : (
                        <>Choose {plan.name}</>
                      )}
                    </button>
                    {isCurrent && (
                      <p className={`mt-2 text-center text-[11px] ${plan.featured ? "text-chalk-dim" : "text-editorial-charcoal/55"}`}>
                        Your current plan
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {passActive && (
              <p className="mt-4 rounded-xl border border-editorial-line-light bg-white px-4 py-2.5 text-xs leading-relaxed text-editorial-charcoal/75">
                {renewLocked
                  ? `Your ${subscription?.planName} pass runs until ${passEndsOn}. Renewal opens in its last ${RENEW_WINDOW_DAYS} days, so nothing you have paid for is lost.`
                  : `Your ${subscription?.planName} pass ends on ${passEndsOn}. A pass bought now starts the moment the current one ends, so no days are lost.`}
              </p>
            )}

            {error && (
              <p className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-xs leading-relaxed text-red-700">{error}</p>
            )}

            <div className="mt-6 flex flex-col gap-3 border-t border-editorial-line pt-5 md:flex-row md:items-center md:justify-between">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-editorial-charcoal">
                <Sparkles size={14} className="text-editorial-sage" /> Every plan gets the whole teacher:
              </p>
              <ul className="flex max-w-2xl flex-wrap gap-x-4 gap-y-1">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex items-center gap-1 text-xs text-editorial-charcoal/70">
                    <Check size={11} className="text-editorial-sage" /> {item}
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-editorial-charcoal/55">
              A one-time payment for 30 days of access. No auto-renewal: you decide each month.
              Buying a plan ends the free week and your plan starts right away.
              Prices in INR, secure checkout by Razorpay. Payment trouble or any question:{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-editorial-sage underline underline-offset-2 hover:text-editorial-charcoal">
                {SUPPORT_EMAIL}
              </a>
              , the only place we answer.
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
