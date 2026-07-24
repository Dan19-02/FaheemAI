/**
 * Act six: honest progress, on midnight. The mastery rule — nothing counts
 * as known until it is proven on a later day — is Faheem's spine and the
 * parent's reason to believe the progress screen. Three states, one rule.
 */
import { motion } from "motion/react";
import { useCalm, fadeUp } from "./reveals";

const STATES = [
  {
    label: "Working on it",
    tone: "border-ink-line text-chalk-dim",
    body: "You met the idea. Faheem is still re-teaching, and that is a normal place to be.",
  },
  {
    label: "Practiced",
    tone: "border-gold-line text-gold-bright",
    body: "You answered a check in your own words, and a strict examiner pass graded it correct. Once.",
  },
  {
    label: "Understood",
    tone: "border-teal-bright/60 text-teal-bright",
    body: "You got it right again on a later day, without warning. Only now does Faheem call it yours.",
  },
];

export default function RegisterSection() {
  const calm = useCalm();

  return (
    <section className="landing-cv landing-cv-register fhm-night px-5 py-20 md:px-8 md:py-28" aria-label="Honest progress">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <motion.p {...fadeUp(calm)} className="fhm-eyebrow">
            Progress you can trust
          </motion.p>
          <motion.h2 {...fadeUp(calm, calm ? 0 : 0.08)} className="kod-display landing-balance mt-4 text-[clamp(1.9rem,5vw,3rem)] leading-[1.1] text-chalk">
            Saying &ldquo;got it&rdquo; is easy. Faheem checks.
          </motion.h2>
          <motion.p {...fadeUp(calm, calm ? 0 : 0.16)} className="landing-pretty mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-chalk-dim md:text-base">
            No streaks for showing up, no confetti for scrolling. A concept
            moves forward only when an examiner pass verifies your own answer,
            and it is only called understood after it survives a second day.
          </motion.p>
        </div>

        <div className="mx-auto mt-12 grid max-w-4xl gap-4 md:grid-cols-3">
          {STATES.map((s, i) => (
            <motion.div key={s.label} {...fadeUp(calm, calm ? 0 : i * 0.1)} className="fhm-night-card p-7 text-center">
              <span className={`kod-pill inline-block border bg-transparent ${s.tone}`}>{s.label}</span>
              <p className="landing-pretty mt-4 text-[15px] leading-relaxed text-chalk-dim">{s.body}</p>
            </motion.div>
          ))}
        </div>

        <motion.p {...fadeUp(calm, calm ? 0 : 0.2)} className="landing-pretty mx-auto mt-8 max-w-2xl text-center text-[14px] leading-relaxed text-chalk-dim">
          The days you show up are counted and kept, and a quiet day never
          subtracts anything. Effort is honoured; mastery is verified. They are
          never confused with each other.
        </motion.p>
      </div>
    </section>
  );
}
