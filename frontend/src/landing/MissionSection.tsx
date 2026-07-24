/**
 * Act eight: for the parent, on midnight. The paying decision-maker gets a
 * direct, dignified address — what this is, what it is not, and the promises
 * that survive the price tag — placed right before the pricing it explains.
 */
import { motion } from "motion/react";
import { useCalm, fadeUp } from "./reveals";

const PROMISES = [
  {
    title: "A tutor, not a shortcut",
    body: "Faheem teaches and verifies; it does not hand over homework answers to copy. Understanding is checked in the student's own words, then checked again days later.",
  },
  {
    title: "You stay in control of the money",
    body: "Every plan is a one-time payment for 30 days. No auto-renewal, no lock-in, no countdown offers. If Faheem stops being useful, you simply do not buy the next month.",
  },
  {
    title: "Progress that means something",
    body: "The progress screen shows verified understanding, not minutes of screen time. Nothing is inflated to keep anyone hooked, including your child.",
  },
];

export default function MissionSection() {
  const calm = useCalm();

  return (
    <section id="parents" className="landing-cv landing-cv-mission fhm-night px-5 py-20 md:px-8 md:py-28" aria-label="For parents">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <motion.p {...fadeUp(calm)} className="fhm-eyebrow">
            For the parent reading this
          </motion.p>
          <motion.h2 {...fadeUp(calm, calm ? 0 : 0.08)} className="kod-display landing-balance mt-4 text-[clamp(1.9rem,5vw,3rem)] leading-[1.1] text-chalk">
            The patience of a private tutor. A fraction of one lesson&rsquo;s price.
          </motion.h2>
          <motion.p {...fadeUp(calm, calm ? 0 : 0.16)} className="landing-pretty mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-chalk-dim md:text-base">
            You already know what a good private tutor costs across the Gulf,
            per hour. Faheem is there every hour, every night of exam season,
            for less each month than a single lesson, and it never rushes,
            never judges, and never lets &ldquo;I think I get it&rdquo; pass unchecked.
          </motion.p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
          {PROMISES.map((p, i) => (
            <motion.div key={p.title} {...fadeUp(calm, calm ? 0 : i * 0.1)} className="fhm-night-card p-7">
              <h3 className="kod-display text-lg leading-snug text-gold-bright">{p.title}</h3>
              <p className="landing-pretty mt-2.5 text-[15px] leading-relaxed text-chalk-dim">{p.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
