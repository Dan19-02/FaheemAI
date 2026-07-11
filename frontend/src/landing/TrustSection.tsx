/**
 * TRUST, why you can trust every answer.
 *
 * Faheem is in trial with no real user base yet, so this is honest social proof:
 * not fabricated numbers or testimonials, but the four accuracy mechanisms the
 * product actually runs, and a fourth pillar that says so out loud. Warm pearl
 * surface, the gold "accuracy is the product" kicker echoing the Proof section.
 */
import { motion } from "motion/react";
import { ShieldCheck, BookMarked, CheckCircle2, Sparkles } from "lucide-react";
import { useCalm, fadeUp } from "./reveals";
import { useLandingCopy } from "./copy";

const PILLAR_ICONS = [ShieldCheck, BookMarked, CheckCircle2, Sparkles];

export default function TrustSection() {
  const calm = useCalm();
  const { c } = useLandingCopy();

  return (
    <section
      id="trust"
      className="fh-cv relative bg-[var(--color-pearl)] px-5 py-20 md:px-8 md:py-28"
      aria-label={c.trust.ariaLabel}
    >
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <motion.p {...fadeUp(calm)} className="text-sm font-bold tracking-wide text-[var(--color-gold)]">
            {c.trust.kicker}
          </motion.p>
          <motion.h2
            {...fadeUp(calm, calm ? 0 : 0.05)}
            className="fh-display mt-3 text-[clamp(2rem,5vw,3.2rem)] text-[var(--color-ink)]"
          >
            {c.trust.title}
          </motion.h2>
          <motion.p
            {...fadeUp(calm, calm ? 0 : 0.1)}
            className="fh-pretty mt-5 text-[15px] leading-relaxed text-[var(--color-ink-soft)] md:text-base"
          >
            {c.trust.subtitle}
          </motion.p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {c.trust.pillars.map((pillar, i) => {
            const Icon = PILLAR_ICONS[i] ?? ShieldCheck;
            return (
              <motion.div
                key={pillar.title}
                {...fadeUp(calm, calm ? 0 : Math.min(i, 3) * 0.06)}
                className="flex flex-col gap-3 rounded-2xl border border-[var(--color-line-soft)] bg-[var(--color-sand)] p-6"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-sea-soft)] text-[var(--color-sea)]">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3 className="fh-display text-lg text-[var(--color-ink)]">{pillar.title}</h3>
                <p className="fh-pretty text-[14px] leading-relaxed text-[var(--color-ink-soft)] md:text-[15px]">
                  {pillar.body}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
