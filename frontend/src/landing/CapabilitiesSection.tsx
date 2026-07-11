/**
 * CAPABILITIES — the full teaching experience, as a calm card grid.
 *
 * The narrative sections prove Faheem is a real teacher (accuracy, re-explain,
 * reach). This section steps back and lays out everything it does — six real
 * capabilities, each a genuine product feature (no invented modules) — so the
 * page has the density a serious product page carries, without ever claiming
 * something Faheem cannot do. Warm pearl surface, sea-teal iconography.
 */
import { motion } from "motion/react";
import { GraduationCap, ShieldCheck, Sparkles, NotebookPen, Camera, Languages } from "lucide-react";
import { useCalm, fadeUp } from "./reveals";
import { useLandingCopy } from "./copy";

const CARD_ICONS = [GraduationCap, ShieldCheck, Sparkles, NotebookPen, Camera, Languages];

export default function CapabilitiesSection() {
  const calm = useCalm();
  const { c } = useLandingCopy();

  return (
    <section
      id="capabilities"
      className="fh-cv relative bg-[var(--color-pearl)] px-5 py-20 md:px-8 md:py-28"
      aria-label={c.capabilities.ariaLabel}
    >
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <motion.p {...fadeUp(calm)} className="text-sm font-bold tracking-wide text-[var(--color-sea)]">
            {c.capabilities.kicker}
          </motion.p>
          <motion.h2
            {...fadeUp(calm, calm ? 0 : 0.05)}
            className="fh-display mt-3 text-[clamp(2rem,5vw,3.2rem)] text-[var(--color-ink)]"
          >
            {c.capabilities.title}
          </motion.h2>
          <motion.p
            {...fadeUp(calm, calm ? 0 : 0.1)}
            className="fh-pretty mt-5 text-[15px] leading-relaxed text-[var(--color-ink-soft)] md:text-base"
          >
            {c.capabilities.subtitle}
          </motion.p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {c.capabilities.cards.map((card, i) => {
            const Icon = CARD_ICONS[i] ?? GraduationCap;
            return (
              <motion.div
                key={card.title}
                {...fadeUp(calm, calm ? 0 : Math.min(i, 3) * 0.06)}
                className="faheem-card flex flex-col gap-3 bg-[var(--color-sand)] p-6 md:p-7"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-sea-soft)] text-[var(--color-sea)]">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3 className="fh-display text-lg text-[var(--color-ink)]">{card.title}</h3>
                <p className="fh-pretty text-[14px] leading-relaxed text-[var(--color-ink-soft)] md:text-[15px]">
                  {card.body}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
