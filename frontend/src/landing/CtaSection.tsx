/**
 * CTA, the calm ask that resolves the page's master loop.
 *
 * No pricing (v2 is free during the Bahrain pilot): one honest promise instead
 * of a plan, and one calm call to action. Deep-sea night surface with the
 * pearl returning as a soft horizon of light, the page ends warm and settled,
 * not with a countdown or a hard sell. The paragraph for the parent is the
 * flattest, most honest line on the page, on purpose.
 */
import { motion } from "motion/react";
import { Check } from "lucide-react";
import type { AuthMode } from "./Landing";
import { useCalm, fadeUp, springIn } from "./reveals";
import { useLandingCopy } from "./copy";

interface CtaSectionProps {
  onAuth: (mode: AuthMode) => void;
}

export default function CtaSection({ onAuth }: CtaSectionProps) {
  const calm = useCalm();
  const { c } = useLandingCopy();
  const INCLUDED = c.cta.included;

  return (
    <section
      id="start"
      className="fh-cv fh-cv-cta fh-night-wash relative overflow-hidden bg-[var(--color-night)] px-5 py-24 text-[var(--color-chalk)] md:px-8 md:py-32"
      aria-label={c.cta.ariaLabel}
    >
      {/* The pearl returns, a soft horizon of light at the top-start. */}
      <div
        aria-hidden="true"
        className="fh-pearl pointer-events-none absolute -top-24 right-[-4rem] h-64 w-64 opacity-40 blur-[2px] md:h-80 md:w-80"
      />

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <motion.p {...fadeUp(calm)} className="text-sm font-bold tracking-wide text-[var(--color-gold)]">
          {c.cta.kicker}
        </motion.p>
        <motion.h2
          {...fadeUp(calm, calm ? 0 : 0.05)}
          className="fh-display mt-4 text-[clamp(2.2rem,6vw,4rem)] leading-[1.1] text-[var(--color-chalk)]"
        >
          {c.cta.title}
        </motion.h2>
        <motion.p
          {...fadeUp(calm, calm ? 0 : 0.1)}
          className="fh-pretty mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-chalk-dim)]"
        >
          {c.cta.para}
        </motion.p>

        <motion.div {...springIn(calm, calm ? 0 : 0.15)} className="mt-10">
          <button
            onClick={() => onAuth("signup")}
            className="faheem-btn px-9 py-4 text-base"
          >
            {c.cta.button}
          </button>
          <p className="mt-4 text-[13px] text-[var(--color-chalk-dim)]">
            {c.cta.buttonNote}
          </p>
        </motion.div>

        {/* What every student gets, the receipt, calm and honest. */}
        <motion.ul
          {...fadeUp(calm)}
          className="mx-auto mt-14 flex max-w-xl flex-col gap-2.5 text-start"
        >
          {INCLUDED.map((item) => (
            <li key={item} className="flex items-start gap-3">
              <Check size={18} className="mt-0.5 shrink-0 text-[var(--color-sea)]" aria-hidden="true" />
              <span className="text-[15px] leading-relaxed text-[var(--color-chalk-dim)]">{item}</span>
            </li>
          ))}
        </motion.ul>

        <motion.p
          {...fadeUp(calm)}
          className="fh-pretty mx-auto mt-12 max-w-2xl border-t border-[var(--color-night-line)] pt-8 text-[14px] leading-relaxed text-[var(--color-chalk-dim)]"
        >
          {c.cta.parentNote}
        </motion.p>
      </div>
    </section>
  );
}
