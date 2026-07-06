/**
 * Act six: the lit page. Pricing printed on one sheet of ivory, the second
 * and last big paper of the night: plans as ledger rows, one calm call to
 * action instead of three shouting ones, and the terms printed at the foot
 * like a receipt. The paragraph for the parent is the flattest, most honest
 * text on the page, on purpose.
 */
import { motion } from "motion/react";
import type { AuthMode } from "./Landing";
import { useCalm, sheetRise } from "./reveals";

interface PricingSheetProps {
  onAuth: (mode: AuthMode) => void;
}

const NOTEBOOK_PERK =
  "Includes the Pre-exam notebook: save the lines that click, auto-filed by chapter, with Clarify notes for revision.";

const PLANS = [
  {
    name: "Starter",
    price: "₹199",
    queries: "100 queries a month",
    note: "About three questions a day. Room to breathe for daily doubts.",
    perk: null as string | null,
    featured: false,
  },
  {
    name: "Regular",
    price: "₹499",
    queries: "300 queries a month",
    note: "Serious study fuel: ten a day for daily learning and exam season revision.",
    perk: NOTEBOOK_PERK,
    featured: false,
  },
  {
    name: "Unlimited",
    price: "₹999",
    queries: "Unlimited queries",
    note: "The whole catch-net. Never ration your curiosity, never count a question.",
    perk: NOTEBOOK_PERK,
    featured: true,
  },
];

const INCLUDED = [
  "All boards: CBSE, ICSE, State, JEE, NEET",
  "English, Hinglish and Hindi",
  "Exam-ready answers + the nine-part notebook",
  "Deep-check examiner pass",
  "Photo doubts and voice sessions",
];

export default function PricingSheet({ onAuth }: PricingSheetProps) {
  const calm = useCalm();

  return (
    <section id="pricing" className="landing-cv landing-cv-pricing relative bg-night px-4 py-20 md:px-8 md:py-28" aria-label="Pricing">
      <div className="relative z-10 mx-auto max-w-[960px]">
        <motion.div {...sheetRise(calm)} className="lit-sheet rounded-3xl bg-editorial-ivory p-6 text-editorial-charcoal sm:p-10 md:p-14">
          <h2 className="landing-balance max-w-2xl font-serif text-[clamp(1.9rem,4.5vw,3rem)] italic leading-tight tracking-[-0.01em]">
            Priced like a notebook, not a coaching class.
          </h2>
          <p className="landing-pretty mt-5 max-w-2xl text-[15px] leading-relaxed text-editorial-charcoal/70 md:text-base">
            Every new student gets one week free from the day they join: up to 10
            questions a day, never more, no card needed. After that, from ₹199 a
            month for a teacher who never runs out of patience. One query is one
            question answered.
          </p>

          {/* The plans, as ledger rows printed on the page */}
          <div className="mt-10">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`grid gap-x-6 gap-y-1 border-t border-editorial-line py-6 sm:grid-cols-[minmax(7rem,10rem)_minmax(6.5rem,auto)_1fr] sm:items-baseline md:py-7 ${
                  plan.featured ? "border-l-2 border-l-editorial-sage pl-4 sm:pl-6" : ""
                }`}
              >
                <h3 className="font-serif text-lg italic text-editorial-sage">{plan.name}</h3>
                <p className="flex items-baseline gap-1">
                  <span className="font-serif text-[clamp(2rem,4vw,2.8rem)] italic leading-none tracking-tight">
                    {plan.price}
                  </span>
                  <span className="text-xs text-editorial-charcoal/65">/ month</span>
                </p>
                <div>
                  <p className="text-[15px] font-semibold">{plan.queries}</p>
                  <p className="landing-pretty mt-1 text-sm leading-relaxed text-editorial-charcoal/70">{plan.note}</p>
                  {plan.perk && (
                    <p className="landing-pretty mt-1.5 text-[13px] font-medium leading-relaxed text-editorial-sage">
                      {plan.perk}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* One calm ask */}
          <div className="mt-8 flex flex-col items-start gap-3 border-t border-editorial-line pt-8 sm:flex-row sm:items-center sm:gap-5">
            <button
              onClick={() => onAuth("signup")}
              className="rounded-full bg-editorial-charcoal px-8 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-editorial-sage"
            >
              Start your free week
            </button>
            <p className="text-sm text-editorial-charcoal/70">
              No card needed. Pick a plan only if the teacher earns it.
            </p>
          </div>

          <p className="landing-pretty mt-8 max-w-2xl text-[15px] leading-relaxed text-editorial-charcoal/75">
            For the parent reading this: every plan is a one-time payment for 30
            days through Razorpay. No auto-renewal, no lock-in, no countdown
            offers. If we stop being useful, you simply do not buy the next month.
          </p>

          {/* The receipt foot */}
          <div className="mt-8 border-t border-editorial-line pt-6">
            <div className="flex flex-col items-start justify-between gap-3 md:flex-row">
              <p className="shrink-0 text-sm font-semibold">Every plan gets the whole teacher:</p>
              <ul className="flex max-w-2xl flex-wrap gap-x-5 gap-y-1.5">
                {INCLUDED.map((item) => (
                  <li key={item} className="text-sm leading-relaxed text-editorial-charcoal/70">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-5 text-[13px] leading-relaxed text-editorial-charcoal/65">
              Prices in INR. Every new account starts with one free week, up to 10
              questions a day. Each plan is a one-time payment for 30 days, with no
              auto-renewal: you choose again each month. Buying a plan ends the free
              week and your plan starts right away. Secure checkout by Razorpay.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
