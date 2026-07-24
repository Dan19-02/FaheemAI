/**
 * Act nine: pricing, on sand. Three soft cards, the middle one crowned in
 * the arch, terms printed plainly beneath. Calm and grown-up: no urgency
 * theatre, no crossed-out prices.
 */
import { motion } from "motion/react";
import { Check } from "lucide-react";
import type { AuthMode } from "./Landing";
import { useCalm, fadeUp, sheetRise } from "./reveals";

interface PricingSheetProps {
  onAuth: (mode: AuthMode) => void;
}

const NOTEBOOK_PERK = "Includes the pre-exam notebook: saved lines, auto-filed by chapter, with Faheem's revision notes.";

const PLANS = [
  {
    name: "Starter",
    price: "$4.99",
    queries: "100 questions a month",
    note: "About three a day. Room to breathe for daily homework doubts.",
    perk: null as string | null,
    featured: false,
  },
  {
    name: "Unlimited",
    price: "$19.99",
    queries: "Unlimited questions",
    note: "Never ration curiosity, never count a question. The whole tutor.",
    perk: NOTEBOOK_PERK,
    featured: true,
  },
  {
    name: "Regular",
    price: "$9.99",
    queries: "300 questions a month",
    note: "Ten a day: steady learning plus exam-season revision.",
    perk: NOTEBOOK_PERK,
    featured: false,
  },
];

const INCLUDED = [
  "All 14 Gulf curricula, grades 6-12",
  "Verified answers on every plan",
  "Re-explanations and follow-ups always free",
  "Photo doubts on every plan",
  "Honest, examiner-verified progress",
];

export default function PricingSheet({ onAuth }: PricingSheetProps) {
  const calm = useCalm();

  return (
    <section id="pricing" className="landing-cv landing-cv-pricing bg-page px-5 py-20 text-ink md:px-8 md:py-28" aria-label="Pricing">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <motion.p {...fadeUp(calm)} className="fhm-eyebrow fhm-eyebrow-ink">
            One week free · no card
          </motion.p>
          <motion.h2 {...fadeUp(calm, calm ? 0 : 0.08)} className="kod-display landing-balance mt-4 text-[clamp(1.9rem,5vw,3rem)] leading-[1.1] text-ink">
            Less each month than one hour of tutoring.
          </motion.h2>
          <motion.p {...fadeUp(calm, calm ? 0 : 0.16)} className="landing-pretty mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-ink-dim md:text-base">
            Every new student starts with a free week: up to 10 questions a
            day, the full experience. One question is one new doubt answered;
            every re-explanation, follow-up, and verification on that doubt is
            free. After the week, choose a pass. Each is a one-time payment
            for 30 days.
          </motion.p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl items-end gap-4 md:grid-cols-3">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.name}
              {...sheetRise(calm, calm ? 0 : i * 0.08)}
              className={
                plan.featured
                  ? "fhm-arch-sm order-first border border-gold-line bg-night p-8 pt-12 text-chalk md:order-none"
                  : "kod-card p-8"
              }
            >
              <p className={`kod-pill inline-block ${plan.featured ? "bg-gold text-pill-ink" : "border border-ink-line bg-surface text-ink"}`}>
                {plan.name}
              </p>
              <p className="mt-5 flex items-baseline gap-1.5">
                <span className={`kod-display text-4xl tracking-tight ${plan.featured ? "text-gold-bright" : "text-ink"}`}>{plan.price}</span>
                <span className={`text-xs ${plan.featured ? "text-chalk-dim" : "text-ink-dim"}`}>/ 30 days</span>
              </p>
              <p className={`mt-3 text-[15px] font-semibold ${plan.featured ? "text-chalk" : "text-ink"}`}>{plan.queries}</p>
              <p className={`landing-pretty mt-1.5 text-sm leading-relaxed ${plan.featured ? "text-chalk-dim" : "text-ink-dim"}`}>{plan.note}</p>
              {plan.perk && (
                <p className={`landing-pretty mt-3 text-[13px] font-medium leading-relaxed ${plan.featured ? "text-gold-bright" : "text-teal-deep"}`}>
                  {plan.perk}
                </p>
              )}
              <button
                onClick={() => onAuth("signup")}
                className={`mt-6 w-full px-6 py-3 text-sm ${plan.featured ? "kod-btn" : "kod-btn-ghost"}`}
              >
                Start with the free week
              </button>
            </motion.div>
          ))}
        </div>

        {/* The receipt foot */}
        <motion.div {...fadeUp(calm, calm ? 0 : 0.15)} className="mx-auto mt-10 max-w-4xl">
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-center gap-1.5 text-sm text-ink-dim">
                <Check size={13} className="text-teal-deep" /> {item}
              </li>
            ))}
          </ul>
          <p className="landing-pretty mx-auto mt-6 max-w-2xl text-center text-[13px] leading-relaxed text-ink-dim">
            Prices in USD. A pass is a one-time payment for 30 days, with no
            auto-renewal: you choose again each month. Buying a pass ends the
            free week and starts your plan right away. Secure checkout.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
