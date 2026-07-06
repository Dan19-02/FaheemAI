/**
 * The finale: lamp off. The words that flew past all night sit in a ticked
 * index now, except one, which waits for tomorrow, because only the product
 * can close that loop. The last call to action sits in the final pool of
 * light, and then the light itself contracts to a bedside dot above the
 * footer: the page ends darker and calmer than it began, permission to
 * sleep. The footer lives in LandingFooter so this section can sit inside
 * <main> while the footer stays a top-level contentinfo landmark.
 */
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Check } from "lucide-react";
import { DRIFT_WORDS } from "./words";
import { useCalm, fadeUp } from "./reveals";
import type { AuthMode } from "./Landing";
import { SUPPORT_EMAIL } from "../defaults";

interface LampOffProps {
  onAuth: (mode: AuthMode) => void;
}

export default function LampOff({ onAuth }: LampOffProps) {
  const calm = useCalm();
  const dimRef = useRef<HTMLDivElement | null>(null);

  // The lamp going out: one glow div, scroll-linked scale only.
  const { scrollYProgress } = useScroll({
    target: dimRef,
    offset: ["start end", "end end"],
  });
  const lampScale = useTransform(scrollYProgress, [0.05, 0.92], [1, 0.045]);

  return (
    <section
      className="landing-cv landing-cv-finale relative bg-gradient-to-b from-night to-night-deep px-4 pt-24 text-center text-chalk md:px-8 md:pt-32"
      aria-label="Start learning"
    >
      <div className="mx-auto max-w-3xl">
        {/* Tonight's index, ticked. */}
        <motion.ul {...fadeUp(calm)} aria-label="Tonight's index" className="mx-auto w-full max-w-md">
          {DRIFT_WORDS.slice(0, 7).map((w) => (
            <li key={w.text} className="flex items-end gap-3 py-1.5 text-left">
              <span className="font-serif text-[15px] italic leading-snug text-chalk-dim">{w.text}</span>
              <span aria-hidden="true" className="landing-leader mb-1.5 min-w-8 flex-1" />
              <Check size={15} className="mb-0.5 shrink-0 text-sage-bright" aria-hidden="true" />
            </li>
          ))}
          <li className="flex items-end gap-3 py-1.5 text-left text-chalk/50">
            <span className="font-serif text-[15px] italic leading-snug">
              tomorrow: rotational motion
            </span>
            <span aria-hidden="true" className="landing-leader mb-1.5 min-w-8 flex-1 opacity-50" />
            <span className="w-[15px] shrink-0" aria-hidden="true" />
          </li>
        </motion.ul>
        <motion.p {...fadeUp(calm)} className="mt-4 text-[13px] text-chalk-dim">
          Seven doubts caught tonight. One waits for tomorrow.
        </motion.p>

        <motion.h2
          {...fadeUp(calm)}
          className="landing-balance mt-14 font-serif text-[clamp(2.2rem,6vw,4rem)] italic leading-[1.08] tracking-[-0.01em] text-chalk"
        >
          Tomorrow, when a word flies past you in class, let it.
        </motion.h2>
        <motion.p {...fadeUp(calm)} className="mt-6 text-lg text-chalk-dim">
          You have a net now. And the lamp stays on as long as you need it.
        </motion.p>

        {/* The last pool of light holds the last ask. */}
        <div className="relative mt-10 inline-block">
          <div
            aria-hidden="true"
            className="lamp-pool pointer-events-none absolute left-1/2 top-1/2 h-[320px] w-[420px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2"
          />
          <button
            onClick={() => onAuth("signup")}
            className="relative rounded-full bg-sage-bright px-9 py-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-bright"
          >
            Start learning tonight
          </button>
          <p className="relative mt-4 text-[13px] text-chalk-dim">
            Free to try. No card needed to create an account.
          </p>
        </div>
      </div>

      {/* The lamp dims to a bedside dot. */}
      <div ref={dimRef} className="relative flex h-[46svh] items-center justify-center overflow-hidden">
        <motion.div
          aria-hidden="true"
          style={calm ? { scale: 0.045 } : { scale: lampScale }}
          className="lamp-pool h-[min(60vw,420px)] w-[min(60vw,420px)]"
        />
      </div>
    </section>
  );
}

export function LandingFooter({ onAuth }: LampOffProps) {
  const link =
    "text-sm text-chalk-dim transition-colors hover:text-chalk focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sage-bright";
  return (
    <footer className="border-t border-night-line bg-night-deep px-5 py-10 text-chalk md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-editorial-sage">
            <span className="font-serif text-lg italic leading-none text-editorial-ivory">ف</span>
          </div>
          <div>
            <p className="font-serif text-lg italic tracking-tight text-chalk">فهيم</p>
            <p className="text-[13px] text-chalk-dim">A patient teacher for every student in Bahrain.</p>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-6" aria-label="Footer">
          <a href="#watch" className={link}>Watch it teach</a>
          <a href="#pricing" className={link}>Pricing</a>
          <a href={`mailto:${SUPPORT_EMAIL}`} className={link}>Support</a>
          <button onClick={() => onAuth("login")} className={link}>
            Sign in
          </button>
        </nav>
      </div>
      <p className="mx-auto mt-8 max-w-6xl text-[12px] text-chalk-dim">
        &copy; 2026 فهيم &middot; Questions, anything at all:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-chalk-dim underline underline-offset-2 transition-colors hover:text-chalk">
          {SUPPORT_EMAIL}
        </a>
        , the only address we answer from.
      </p>
    </footer>
  );
}
