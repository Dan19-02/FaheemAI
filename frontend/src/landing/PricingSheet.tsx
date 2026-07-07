/**
 * Act six: the lit page. Printed on one sheet of ivory, the second and last
 * big paper of the night. During the Bahrain pilot there is no price to
 * print, so the sheet carries one honest promise instead of a ledger: the
 * teacher is free while we learn what students here need. One calm call to
 * action, and the terms printed at the foot like a receipt. The paragraph for
 * the parent is the flattest, most honest text on the page, on purpose.
 */
import { motion } from "motion/react";
import type { AuthMode } from "./Landing";
import { useCalm, sheetRise } from "./reveals";

interface PricingSheetProps {
  onAuth: (mode: AuthMode) => void;
}

const INCLUDED = [
  "Bahrain MoE, CBSE and Cambridge",
  "Arabic and English",
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
            Free while Bahrain teaches us how to teach.
          </h2>
          <p className="landing-pretty mt-5 max-w-2xl text-[15px] leading-relaxed text-editorial-charcoal/70 md:text-base">
            Faheem is in an open pilot for students in Bahrain, and during the
            pilot it costs nothing. No card, no plan to choose, no counting your
            questions. We would rather earn your trust first and worry about the
            rest later.
          </p>

          {/* The one promise, printed where the ledger used to be */}
          <div className="mt-10 border-t border-editorial-line pt-8">
            <p className="flex items-baseline gap-3">
              <span className="font-serif text-[clamp(2.4rem,6vw,3.6rem)] italic leading-none tracking-tight text-editorial-sage">
                Free
              </span>
              <span className="text-sm text-editorial-charcoal/65">during the Bahrain pilot</span>
            </p>
            <p className="landing-pretty mt-3 max-w-2xl text-[15px] leading-relaxed text-editorial-charcoal/70">
              Ask as much as you need. The whole teacher is open: every board,
              both languages, the notebook, the deep-check pass, photo doubts and
              voice sessions. Nothing is held back for a paid tier, because there
              isn&rsquo;t one yet.
            </p>
          </div>

          {/* One calm ask */}
          <div className="mt-8 flex flex-col items-start gap-3 border-t border-editorial-line pt-8 sm:flex-row sm:items-center sm:gap-5">
            <button
              onClick={() => onAuth("signup")}
              className="rounded-full bg-editorial-charcoal px-8 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-editorial-sage"
            >
              Start learning free
            </button>
            <p className="text-sm text-editorial-charcoal/70">
              No card needed. Just sign in and ask your first question.
            </p>
          </div>

          <p className="landing-pretty mt-8 max-w-2xl text-[15px] leading-relaxed text-editorial-charcoal/75">
            For the parent reading this: there is nothing to pay and nothing to
            cancel. Faheem is free for the length of the pilot. If we ever
            introduce a plan, it will be clearly announced, never switched on
            quietly, and never with a countdown offer.
          </p>

          {/* The receipt foot */}
          <div className="mt-8 border-t border-editorial-line pt-6">
            <div className="flex flex-col items-start justify-between gap-3 md:flex-row">
              <p className="shrink-0 text-sm font-semibold">Every student gets the whole teacher:</p>
              <ul className="flex max-w-2xl flex-wrap gap-x-5 gap-y-1.5">
                {INCLUDED.map((item) => (
                  <li key={item} className="text-sm leading-relaxed text-editorial-charcoal/70">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-5 text-[13px] leading-relaxed text-editorial-charcoal/65">
              Free during the Bahrain pilot. No card, no plan, no auto-renewal.
              Create an account and start asking right away.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
