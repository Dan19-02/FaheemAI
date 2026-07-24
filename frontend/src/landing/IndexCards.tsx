/**
 * Act five: the classroom fit, on sand. The 14 Gulf curricula as quiet
 * recognition chips, then one idea taught at three depths, then the full
 * grade-7 worked answer on Faheem's own paper inside the arch frame.
 */
import { motion } from "motion/react";
import { Markdown } from "../Markdown";
import { REAL_VOICES, REAL_GRADE7_QUESTION, REAL_GRADE7_ANSWER } from "./realAnswer";
import { useCalm, fadeUp, sheetRise } from "./reveals";

const INTL = ["Cambridge (CAIE)", "Pearson Edexcel", "IB", "American (US)", "CBSE", "ICSE / ISC", "French (AEFE)", "SABIS"];
const MINISTRY = ["UAE MoE", "Saudi Arabia MoE", "Qatar MoEHE", "Kuwait MoE", "Bahrain MoE", "Oman MoE"];

export default function IndexCards() {
  const calm = useCalm();

  return (
    <section className="landing-cv landing-cv-cards bg-page px-5 py-20 text-ink md:px-8 md:py-28" aria-label="Made for every Gulf classroom">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <motion.p {...fadeUp(calm)} className="fhm-eyebrow fhm-eyebrow-ink">
            Fourteen curricula, one tutor
          </motion.p>
          <motion.h2 {...fadeUp(calm, calm ? 0 : 0.08)} className="kod-display landing-balance mt-4 text-[clamp(1.9rem,5vw,3rem)] leading-[1.1] text-ink">
            Faheem knows which classroom you sit in.
          </motion.h2>
          <motion.p {...fadeUp(calm, calm ? 0 : 0.16)} className="landing-pretty mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-ink-dim md:text-base">
            From Cambridge and IB to every ministry syllabus in the Gulf,
            answers are shaped to your curriculum, your grade, and the way your
            exams actually mark.
          </motion.p>
        </div>

        {/* The curricula */}
        <motion.div {...fadeUp(calm, calm ? 0 : 0.2)} className="mx-auto mt-10 max-w-4xl">
          <div className="flex flex-wrap justify-center gap-2">
            {INTL.map((b) => (
              <span key={b} className="kod-pill border border-ink-line bg-surface text-ink">{b}</span>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap justify-center gap-2">
            {MINISTRY.map((b) => (
              <span key={b} className="kod-pill border border-gold-line bg-gold-pale/40 text-ink">{b}</span>
            ))}
          </div>
          <p className="mt-4 text-center text-[13px] text-ink-dim">
            International schools and national ministry curricula, across all six Gulf countries.
          </p>
        </motion.div>

        {/* One idea, three depths */}
        <div className="mt-16 grid gap-4 lg:grid-cols-3">
          {REAL_VOICES.map((v, i) => (
            <motion.div key={v.tag} {...fadeUp(calm, calm ? 0 : i * 0.1)} className="kod-card p-7">
              <span className="kod-pill inline-block bg-ink text-page">{v.tag}</span>
              <p lang={v.lang} className="landing-pretty mt-4 text-[15px] leading-relaxed text-ink md:text-base">
                &ldquo;{v.line}&rdquo;
              </p>
            </motion.div>
          ))}
        </div>
        <p className="landing-pretty mt-4 text-center text-[13px] leading-relaxed text-ink-dim">
          Newton&rsquo;s second law at three depths. The profile decides which one a
          student meets; nothing has to be asked twice.
        </p>

        {/* The younger classroom: full worked answer in the arch */}
        <div className="mt-20 grid items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="lg:sticky lg:top-16">
            <motion.p {...fadeUp(calm)} className="fhm-eyebrow fhm-eyebrow-ink">
              grade 7 · mathematics
            </motion.p>
            <motion.h3 {...fadeUp(calm, calm ? 0 : 0.06)} className="kod-display landing-balance mt-3 text-2xl leading-snug text-ink md:text-3xl">
              And it is not only for the exam-prep student.
            </motion.h3>
            <motion.p {...fadeUp(calm, calm ? 0 : 0.12)} className="landing-pretty mt-4 max-w-lg text-[15px] leading-relaxed text-ink-dim">
              A grade 7 student asked about simple interest. The whole lesson
              came back at grade 7 depth, verified, and it ends the way a good
              tutor ends: by handing the next one to the student.
            </motion.p>
          </div>
          <div className="flex flex-col gap-4">
            <motion.div {...sheetRise(calm)} className="flex flex-col items-end">
              <div className="max-w-[92%] rounded-3xl rounded-br-md border border-gold-line bg-surface p-5 text-sm leading-relaxed text-ink md:max-w-[80%]">
                {REAL_GRADE7_QUESTION}
              </div>
            </motion.div>
            <motion.div {...sheetRise(calm, calm ? 0 : 0.08)} className="flex flex-col items-start">
              <div className="mb-2 flex items-center gap-2">
                <span className="kod-pill bg-ink text-page">Faheem</span>
                <span className="kod-pill bg-teal-pale text-teal-deep">verified</span>
              </div>
              <div
                tabIndex={0}
                role="region"
                aria-label="A Faheem answer for a grade 7 profile, scrollable"
                className="lit-sheet fhm-arch-sm max-h-[430px] w-full min-w-0 overflow-y-auto bg-editorial-ivory p-5 pt-10 text-sm leading-relaxed text-editorial-charcoal md:p-7 md:pt-12"
              >
                <Markdown>{REAL_GRADE7_ANSWER}</Markdown>
              </div>
            </motion.div>
            <p className="landing-pretty text-[13px] leading-relaxed text-ink-dim">
              The last line asks the student to try one themselves. Faheem will
              wait for the answer.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
