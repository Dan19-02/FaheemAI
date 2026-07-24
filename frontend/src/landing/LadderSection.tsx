/**
 * Act three: the re-teaching ladder, on midnight. The core promise — being
 * confused is not a failure state here — told as five ascending doors Faheem
 * tries, each one lit a step warmer. Ends on the "always free" rule so the
 * anxiety about asking twice dies on this screen.
 */
import { motion } from "motion/react";
import { useCalm, fadeUp } from "./reveals";

const RUNGS = [
  { title: "The plain heart of it", body: "Forget the textbook voice. One everyday sentence that carries the whole idea." },
  { title: "A fresh analogy", body: "A new comparison from your world, never the same one twice." },
  { title: "The smallest step", body: "The exact sub-step that tripped you, isolated, with a picture." },
  { title: "A worked micro-example", body: "One tiny concrete case, solved with you, step by step." },
  { title: "Pinpoint the fuzz", body: "One gentle question to find the exact word or step that isn't landing." },
];

export default function LadderSection() {
  const calm = useCalm();

  return (
    <section className="landing-cv landing-cv-ladder fhm-night px-5 py-20 md:px-8 md:py-28" aria-label="How Faheem re-teaches">
      <div className="mx-auto max-w-6xl">
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="lg:sticky lg:top-16">
            <motion.p {...fadeUp(calm)} className="fhm-eyebrow">
              When it doesn&rsquo;t land the first time
            </motion.p>
            <motion.h2 {...fadeUp(calm, calm ? 0 : 0.08)} className="kod-display landing-balance mt-4 text-[clamp(1.9rem,5vw,3rem)] leading-[1.1] text-chalk">
              &ldquo;I still don&rsquo;t get it&rdquo; is a button here, not a confession.
            </motion.h2>
            <motion.p {...fadeUp(calm, calm ? 0 : 0.16)} className="landing-pretty mt-5 max-w-lg text-[15px] leading-relaxed text-chalk-dim md:text-base">
              One tap, and Faheem re-teaches the same idea through a different
              door, climbing this ladder until one of them opens. No sighing,
              no &ldquo;as I already said&rdquo;, no judgement, at midnight or at noon.
            </motion.p>
            <motion.div {...fadeUp(calm, calm ? 0 : 0.22)} className="mt-8 rounded-2xl border border-gold-line bg-night-soft p-5">
              <p className="text-sm leading-relaxed text-chalk">
                Every re-explanation is <span className="text-gold-bright">free</span>. One question spends one
                credit; asking to understand it again, five times if you need,
                never costs another.
              </p>
            </motion.div>
          </div>

          <div className="flex flex-col gap-3.5">
            {RUNGS.map((r, i) => (
              <motion.div key={r.title} {...fadeUp(calm, calm ? 0 : i * 0.08)} className="fhm-night-card flex items-start gap-5 p-6">
                <span
                  aria-hidden="true"
                  className="kod-display mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold-line text-sm text-gold-bright"
                  style={{ opacity: 0.55 + i * 0.11 }}
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="kod-display text-lg text-chalk">{r.title}</h3>
                  <p className="landing-pretty mt-1 text-[15px] leading-relaxed text-chalk-dim">{r.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
