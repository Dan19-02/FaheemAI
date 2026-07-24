/**
 * Act seven: the fair question, on sand. "Why not just ChatGPT?" answered as
 * four calm contrasts on a single ledger, closed by the blind-evaluation
 * figure with its provenance stated plainly.
 */
import { motion } from "motion/react";
import { useCalm, fadeUp } from "./reveals";

const CONTRASTS = [
  {
    them: "A chatbot answers once and moves on.",
    faheem: "Faheem stays, and re-teaches a different way each time, until it truly makes sense.",
  },
  {
    them: "A chatbot aims to sound right.",
    faheem: "Faheem runs a second examiner pass over its own finished work and substitutes results back in before you see them.",
  },
  {
    them: "A chatbot knows the whole internet.",
    faheem: "Faheem knows your curriculum: the syllabus, the depth, and the way your examiner awards marks.",
  },
  {
    them: "A chatbot takes your word for it.",
    faheem: "Faheem verifies understanding with graded checks, and only counts a concept after it survives a later day.",
  },
];

export default function WhySection() {
  const calm = useCalm();

  return (
    <section id="why" className="landing-cv landing-cv-why bg-page px-5 py-20 text-ink md:px-8 md:py-28" aria-label="Why Faheem and not a general chatbot">
      <div className="mx-auto max-w-6xl">
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="lg:sticky lg:top-16">
            <motion.p {...fadeUp(calm)} className="fhm-eyebrow fhm-eyebrow-ink">
              The fair question
            </motion.p>
            <motion.h2 {...fadeUp(calm, calm ? 0 : 0.08)} className="kod-display landing-balance mt-4 text-[clamp(1.9rem,5vw,3rem)] leading-[1.1] text-ink">
              But ChatGPT exists, right?
            </motion.h2>
            <motion.p {...fadeUp(calm, calm ? 0 : 0.16)} className="landing-pretty mt-5 max-w-lg text-[15px] leading-relaxed text-ink-dim md:text-base">
              It does, and it is remarkable. It was built to answer everyone,
              about everything, once. Faheem was built to look after one
              student at a time until the understanding is real, and every
              difference below follows from that single choice.
            </motion.p>
          </div>

          <div>
            <div className="flex flex-col">
              {CONTRASTS.map((row, i) => (
                <motion.div key={row.faheem} {...fadeUp(calm, calm ? 0 : i * 0.07)} className="grid gap-2 border-t border-ink-line py-6 first:border-t-0 sm:grid-cols-2 sm:gap-8">
                  <p className="text-[15px] leading-relaxed text-ink-dim">{row.them}</p>
                  <p className="text-[15px] font-medium leading-relaxed text-ink">{row.faheem}</p>
                </motion.div>
              ))}
            </div>
            <motion.div {...fadeUp(calm, calm ? 0 : 0.2)} className="mt-6 rounded-2xl border border-gold-line bg-gold-pale/30 p-6">
              <p className="kod-display text-2xl text-ink">9.62 / 10</p>
              <p className="landing-pretty mt-2 text-sm leading-relaxed text-ink-dim">
                One number, with its provenance attached: in blind evaluations
                we run on ourselves, six independent AI judges score real exam
                questions across nine systems, answers shuffled so no system
                sits in a favoured position. In the latest run, Faheem&rsquo;s
                engine took the highest accuracy score of all nine, the biggest
                general chatbots included.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
