/**
 * HERO — the open loop.
 *
 * Faheem's promise, stated as a claim that pulls you down to see it is true:
 * a patient teacher, in YOUR language, that gets YOUR exact Bahrain
 * curriculum right. Warm pearl surface, a Gulf dawn wash and a single luminous
 * pearl as a quiet motif. The forward gravity: the accuracy claim is asserted
 * here but only proven in the next section, and a sliver of that proof (the
 * sea-teal source chip) already peeks into frame at the hero's foot.
 */
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, BookMarked } from "lucide-react";
import { REAL_SOURCE } from "./realAnswer";
import { useCalm, EASE } from "./reveals";
import { useLandingCopy } from "./copy";
import type { AuthMode } from "./Landing";

interface HeroSectionProps {
  onAuth: (mode: AuthMode) => void;
}

export default function HeroSection({ onAuth }: HeroSectionProps) {
  const calm = useCalm();
  const { c, dir } = useLandingCopy();
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  const enter = (delay: number) =>
    calm
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay, ease: EASE },
        };

  return (
    <section
      id="top"
      className="fh-hero-wash relative overflow-hidden"
      aria-label={c.hero.ariaLabel}
    >
      {/* The pearl dot-field, quiet, behind everything. */}
      <div aria-hidden="true" className="fh-pearl-field pointer-events-none absolute inset-0 opacity-[0.5]" />

      {/* A single luminous pearl — a Gulf ornament floating at the top-start. */}
      <motion.div
        aria-hidden="true"
        className="fh-pearl pointer-events-none absolute -top-16 -left-16 h-56 w-56 opacity-70 blur-[1px] md:h-72 md:w-72"
        {...(calm
          ? {}
          : {
              initial: { opacity: 0, scale: 0.85 },
              animate: { opacity: 0.7, scale: 1 },
              transition: { duration: 1.1, ease: EASE },
            })}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6 pb-20 pt-16 md:px-8 md:pb-28 md:pt-24">
        <motion.p
          {...enter(0.05)}
          className="fh-source-chip"
          style={{ animation: "none" }}
        >
          <BookMarked size={13} aria-hidden="true" />
          {c.hero.chip}
        </motion.p>

        <motion.h1
          id="hero-title"
          tabIndex={-1}
          {...enter(0.15)}
          className="fh-display mt-6 max-w-4xl text-[clamp(2.6rem,8vw,5.2rem)] text-[var(--color-ink)] focus:outline-none"
        >
          {c.hero.titleLead}{" "}
          <span className="text-[var(--color-red)]">{c.hero.titleAccent}</span>
          <br className="hidden sm:block" /> {c.hero.titleMid}{" "}
          <span className="relative whitespace-nowrap text-[var(--color-sea)]">
            {c.hero.titleUnderlined}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 -bottom-1 h-[6px] rounded-full bg-[var(--color-sea)]/20"
            />
          </span>
          {c.hero.titleTail}
        </motion.h1>

        <motion.p
          {...enter(0.3)}
          className="fh-pretty mt-6 max-w-2xl text-[17px] leading-relaxed text-[var(--color-ink-soft)] md:text-xl"
        >
          {c.hero.subtitle}
        </motion.p>

        <motion.div
          {...enter(0.45)}
          className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <button
            onClick={() => onAuth("signup")}
            className="faheem-btn w-full text-base sm:w-auto"
          >
            {c.hero.ctaPrimary}
          </button>
          <a
            href="#proof"
            className="faheem-btn-ghost group inline-flex w-full items-center justify-center gap-2 text-center text-base sm:w-auto"
          >
            {c.hero.ctaSecondary}
            <Arrow
              size={17}
              aria-hidden="true"
              className={dir === "rtl" ? "transition-transform group-hover:-translate-x-1" : "transition-transform group-hover:translate-x-1"}
            />
          </a>
        </motion.div>

        <motion.p {...enter(0.6)} className="mt-7 text-sm text-[var(--color-ink-soft)]">
          <span>{c.hero.freeNote}</span>
          <span aria-hidden="true" className="mx-2">·</span>
          <span>العربية</span>
          <span aria-hidden="true" className="mx-1.5">·</span>
          <span className="fh-latin">English</span>
        </motion.p>
      </div>

      {/* The "one more section" edge: a sliver of the proof already peeking in,
          so forward gravity never closes at the hero's clean bottom edge. */}
      <div
        aria-hidden="true"
        className="relative z-10 mx-auto -mb-px max-w-6xl px-6 md:px-8"
      >
        <div className="flex items-center gap-2 border-t border-dashed border-[var(--color-line)] pt-4 text-[13px] text-[var(--color-ink-soft)]">
          <span className="fh-source-chip" style={{ animation: "none" }}>
            <BookMarked size={12} />
            {REAL_SOURCE.unit}
          </span>
          <span className="hidden sm:inline">{c.hero.sliverNote}</span>
        </div>
      </div>
    </section>
  );
}
