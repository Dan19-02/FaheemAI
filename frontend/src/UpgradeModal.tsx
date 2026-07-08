/**
 * The plan chooser + paywall. Opens when a student runs out of trial / quota,
 * or any time they tap the usage pill to upgrade. The catalogue (prices,
 * quotas, currency) comes from the backend via api.getPlans() so the UI can
 * never drift from what the server actually charges; only display names,
 * blurbs, and chrome live in the locale dictionaries.
 *
 * Billing is dormant during the Bahrain pilot: when the backend reports
 * configured:false the purchase buttons give way to a "coming soon, free
 * during the pilot" note. The Razorpay flow itself stays wired for the day
 * it switches on.
 *
 * Calm, honest, no urgency theatre, in keeping with the brand: no countdowns,
 * no fake discounts. It simply states where the student stands and what each
 * plan gives.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { X, Check, Loader2, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { api, type Account, type PlansResponse } from "./api";
import type { Subscription } from "./types";
import { startCheckout } from "./billing";
import { SUPPORT_EMAIL } from "./defaults";
import { useLocale, type TranslateFn } from "./i18n/LocaleContext";

const INCLUDED_KEYS = [
  "plans.included.boards",
  "plans.included.langs",
  "plans.included.reexplain",
  "plans.included.deepCheck",
  "plans.included.notebook",
  "plans.included.voice",
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

function statusLine(t: TranslateFn, sub?: Subscription): string {
  if (!sub) return "";
  if (sub.state === "trial") return t("plans.statusTrial", { n: sub.remaining ?? 0 });
  if (sub.state === "active") {
    return sub.remaining == null
      ? t("plans.statusUnlimited", { plan: sub.planName })
      : t("plans.statusActive", { plan: sub.planName, n: sub.remaining });
  }
  if (sub.state === "plan_expired") return t("plans.statusExpired", { plan: sub.planName });
  return t("plans.statusTrialOver");
}

// Mirrors backend subscription.ts: while a pass is active, buying is blocked
// until its last days; a renewal bought then STARTS AT the current expiry, so
// no paid day is ever lost.
const RENEW_WINDOW_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export default function UpgradeModal({ open, onClose, account, subscription, reason, onActivated }: UpgradeModalProps) {
  const { t, lang } = useLocale();
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---- Catalogue: fetched fresh on every open so prices are never stale ----
  const [catalogue, setCatalogue] = useState<PlansResponse | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState(false);
  // Guards a late response from a previous open/retry cycle.
  const fetchSeq = useRef(0);

  const loadPlans = useCallback(() => {
    const seq = ++fetchSeq.current;
    setPlansLoading(true);
    setPlansError(false);
    api
      .getPlans()
      .then((res) => {
        if (seq !== fetchSeq.current) return;
        setCatalogue(res);
      })
      .catch(() => {
        if (seq !== fetchSeq.current) return;
        setPlansError(true);
      })
      .finally(() => {
        if (seq === fetchSeq.current) setPlansLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusyPlan(null);
    loadPlans();
  }, [open, loadPlans]);

  // ---- Focus management: move focus in on open, restore it on close ----
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The dialog is in the DOM by the time this effect runs, so focus it
    // synchronously; a deferred (rAF) focus can silently never land.
    dialogRef.current?.focus();
    return () => {
      previousFocus.current?.focus();
    };
  }, [open]);

  // Simple trap: Escape closes, Tab cycles inside the dialog.
  const onDialogKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.hasAttribute("disabled"));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || active === root) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const dateLocale = lang === "ar" ? "ar-BH" : "en-GB";

  const expiresMs = subscription?.planExpiresAt ? Date.parse(subscription.planExpiresAt) : null;
  const passActive = subscription?.state === "active" && expiresMs != null && expiresMs > Date.now();
  // Mid-pass: purchases are locked (the server also enforces this with a 409).
  const renewLocked = passActive && expiresMs! - Date.now() > RENEW_WINDOW_DAYS * DAY_MS;
  const passEndsOn = expiresMs
    ? new Date(expiresMs).toLocaleDateString(dateLocale, { day: "numeric", month: "long" })
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
      setError(err?.message || t("plans.checkoutError"));
    }
  };

  const status = statusLine(t, subscription);

  // The dictionaries carry names/blurbs for the known plan ids; an unknown id
  // (a future catalogue addition) falls back to the backend's own strings
  // rather than rendering a raw key.
  const localized = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };

  const configured = catalogue?.configured === true;
  const currencyLabel = catalogue
    ? catalogue.currency === "BHD"
      ? t("currency.BHD")
      : catalogue.currency
    : "";
  const priceLabel = (price: number) => `${currencyLabel} ${price}`;

  // Entry-only animation, no AnimatePresence: its exit tracking (motion 12 +
  // React 19 StrictMode) can finish the fade yet never unmount the subtree,
  // leaving an invisible full-screen backdrop that swallows every click in the
  // app. Closing instantly is a fair trade for a close that always works.
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1e1e1a]/50 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-editorial-line bg-editorial-ivory p-6 shadow-xl outline-none md:p-9"
        role="dialog"
        aria-modal="true"
        aria-label={t("usage.choosePlan")}
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
      >
        <button
          onClick={onClose}
          aria-label={t("common.close")}
          className="absolute end-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-editorial-line text-editorial-charcoal/50 transition-colors hover:bg-editorial-stone hover:text-editorial-charcoal"
        >
          <X size={16} />
        </button>

        <div className="max-w-2xl">
          <h2 className="font-serif text-[clamp(1.6rem,4vw,2.4rem)] italic leading-tight tracking-[-0.01em] text-editorial-charcoal">
            {t("plans.title")}
          </h2>
          {reason ? (
            <p className="mt-3 rounded-2xl border border-editorial-line-light bg-white px-4 py-3 text-sm leading-relaxed text-editorial-charcoal/80">
              {reason}
            </p>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-editorial-charcoal/70">{t("plans.freeNote")}</p>
          )}
          {status && <p className="mt-2 text-xs font-medium text-editorial-sage">{status}</p>}
        </div>

        {plansLoading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-editorial-charcoal/60">
            <Loader2 size={15} className="animate-spin" /> {t("plans.loading")}
          </div>
        )}

        {!plansLoading && plansError && (
          <div className="mt-7 flex flex-col items-center gap-3 rounded-2xl border border-editorial-line bg-white px-4 py-8">
            <p role="alert" className="text-sm text-editorial-charcoal/75">
              {t("plans.loadError")}
            </p>
            <button
              onClick={loadPlans}
              className="rounded-full bg-editorial-charcoal px-5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        {!plansLoading && !plansError && catalogue && (
          <>
            <div className="mt-7 grid gap-4 md:grid-cols-3">
              {catalogue.plans.map((plan) => {
                const isCurrent = subscription?.state === "active" && subscription.plan === plan.id;
                const busy = busyPlan === plan.id;
                const featured = plan.id === "unlimited";
                const name = localized(`plans.${plan.id}.name`, plan.name);
                const blurb = localized(`plans.${plan.id}.blurb`, plan.blurb);
                const quota =
                  plan.monthlyQueries == null
                    ? t("plans.questionsUnlimited")
                    : t("plans.questionsMonthly", { n: plan.monthlyQueries });
                const hasNotebook = plan.id === "regular" || plan.id === "unlimited";
                return (
                  <div
                    key={plan.id}
                    className={`flex flex-col rounded-3xl p-6 ${
                      featured ? "bg-night text-chalk" : "border border-editorial-line bg-white text-editorial-charcoal"
                    }`}
                  >
                    <h3 className={`font-serif text-lg italic ${featured ? "text-sage-bright" : "text-editorial-sage"}`}>
                      {name}
                    </h3>
                    <p className="mt-3 flex items-baseline gap-1.5">
                      <span className="font-serif text-4xl italic tracking-tight">{priceLabel(plan.price)}</span>
                      <span className={`text-xs ${featured ? "text-chalk-dim" : "text-editorial-charcoal/60"}`}>
                        {t("plans.perMonth")}
                      </span>
                    </p>
                    <p className="mt-3 text-sm font-semibold">{quota}</p>
                    <p className={`mt-1.5 text-xs leading-relaxed ${featured ? "text-chalk-dim" : "text-editorial-charcoal/65"}`}>
                      {blurb}
                    </p>
                    <div className="flex-1">
                      {hasNotebook && (
                        <p className={`mt-2 text-xs font-medium leading-relaxed ${featured ? "text-sage-bright" : "text-editorial-sage"}`}>
                          {t("plans.notebookPerk")}
                        </p>
                      )}
                    </div>
                    {configured ? (
                      <button
                        onClick={() => buy(plan.id)}
                        disabled={busy || busyPlan !== null || renewLocked}
                        className={`mt-5 flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 ${
                          featured ? "bg-sage-bright text-night" : "bg-editorial-charcoal text-white"
                        }`}
                      >
                        {busy ? (
                          <>
                            <Loader2 size={14} className="animate-spin" /> {t("plans.opening")}
                          </>
                        ) : isCurrent ? (
                          <>{t("plans.renewPrice", { price: priceLabel(plan.price) })}</>
                        ) : (
                          <>{t("plans.choose", { name })}</>
                        )}
                      </button>
                    ) : (
                      <p
                        className={`mt-5 rounded-full px-5 py-2.5 text-center text-sm font-semibold ${
                          featured ? "bg-night-soft text-chalk-dim" : "bg-editorial-stone text-editorial-charcoal/70"
                        }`}
                      >
                        {t("plans.comingSoon")}
                      </p>
                    )}
                    {isCurrent && (
                      <p className={`mt-2 text-center text-[11px] ${featured ? "text-chalk-dim" : "text-editorial-charcoal/55"}`}>
                        {t("plans.currentPlan")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {!configured && (
              <p className="mt-4 rounded-xl border border-editorial-line-light bg-white px-4 py-2.5 text-xs leading-relaxed text-editorial-charcoal/75">
                {t("plans.pilotFree")}
              </p>
            )}

            {configured && passActive && (
              <p className="mt-4 rounded-xl border border-editorial-line-light bg-white px-4 py-2.5 text-xs leading-relaxed text-editorial-charcoal/75">
                {renewLocked
                  ? t("plans.renewLocked", { plan: subscription?.planName ?? "", date: passEndsOn, n: RENEW_WINDOW_DAYS })
                  : t("plans.renewOpen", { plan: subscription?.planName ?? "", date: passEndsOn })}
              </p>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-xs leading-relaxed text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 border-t border-editorial-line pt-5 md:flex-row md:items-center md:justify-between">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-editorial-charcoal">
            <Sparkles size={14} className="text-editorial-sage" /> {t("plans.everyPlan")}
          </p>
          <ul className="flex max-w-2xl flex-wrap gap-x-4 gap-y-1">
            {INCLUDED_KEYS.map((key) => (
              <li key={key} className="flex items-center gap-1 text-xs text-editorial-charcoal/70">
                <Check size={11} className="shrink-0 text-editorial-sage" /> {t(key)}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-editorial-charcoal/55">
          {configured ? t("plans.footer") : t("plans.footerPilot")}{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            dir="ltr"
            className="font-latin text-editorial-sage underline underline-offset-2 hover:text-editorial-charcoal"
          >
            {SUPPORT_EMAIL}
          </a>
          {t("plans.footerOnly")}
        </p>
      </motion.div>
    </div>
  );
}
