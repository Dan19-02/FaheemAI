/**
 * REEXPLAIN — the teaching style, and a breath after the dense night proof.
 *
 * Understanding rarely lands on the first try. Under every answer sits one
 * button: "ما زال غير واضح؟". One tap, no need to put your confusion into
 * words, and the teacher explains again a completely different way — a fresh
 * analogy, no formula, until it lands. We show the REAL re-explanation the
 * live product gave when we tapped it on the answer above, then name the shape
 * of what just happened as four calm steps.
 *
 * Warm pearl surface (the answer paper we tap sits in light this time), so the
 * page breathes after the dark, dense proof section.
 */
import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { Markdown } from "../Markdown";
import { REAL_REEXPLANATION, REAL_STILL_FUZZY_PROMPT } from "./realAnswer";
import { useCalm, fadeUp, sheetRise, bubbleIn, drawX } from "./reveals";
import { useLandingCopy } from "./copy";

export default function ReexplainSection() {
  const calm = useCalm();
  const { c } = useLandingCopy();
  const STEPS = c.reexplain.steps;

  return (
    <section
      id="how"
      className="fh-cv fh-cv-reexplain relative bg-[var(--color-pearl)] px-5 py-20 md:px-8 md:py-28"
      aria-label={c.reexplain.ariaLabel}
    >
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          {/* The pitch, resting while the proof glows beside it. */}
          <div className="lg:sticky lg:top-24">
            <h2 className="fh-display text-[clamp(2rem,5vw,3.2rem)] text-[var(--color-ink)]">
              {c.reexplain.title}
            </h2>
            <p className="fh-pretty mt-5 max-w-lg text-[15px] leading-relaxed text-[var(--color-ink-soft)] md:text-base">
              {c.reexplain.para1}
            </p>
            <span
              aria-hidden="true"
              className="fh-breathe pointer-events-none mt-5 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-sand)] px-4 py-2 text-sm font-semibold text-[var(--color-red)] select-none"
            >
              <Sparkles size={14} /> {c.reexplain.chip}
            </span>
            <p className="fh-pretty mt-5 max-w-lg text-[15px] leading-relaxed text-[var(--color-ink-soft)] md:text-base">
              {c.reexplain.para2}
            </p>
          </div>

          {/* The proof: the real re-explanation. */}
          <div className="flex flex-col gap-4">
            <motion.div {...bubbleIn(calm, 18)} className="flex flex-col items-start">
              <div className="mb-1.5 px-1 text-[11px] text-[var(--color-ink-soft)]">{c.reexplain.youLabel}</div>
              <div dir="rtl" lang="ar" className="faheem-bubble-user max-w-[92%] rounded-tr-md px-4 py-3 text-[15px] leading-relaxed md:max-w-[82%]">
                {REAL_STILL_FUZZY_PROMPT}
              </div>
            </motion.div>
            <motion.div {...sheetRise(calm)} className="flex flex-col items-end">
              <div className="mb-1.5 px-1 text-[11px] text-[var(--color-ink-soft)]">{c.reexplain.faheemLabel}</div>
              <div
                tabIndex={0}
                role="region"
                dir="rtl"
                lang="ar"
                aria-label="إعادة الشرح الحقيقية من فهيم، قابلة للتمرير"
                className="faheem-card max-h-[440px] w-full min-w-0 overflow-y-auto bg-[var(--color-pearl)] p-4 text-sm leading-relaxed text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-red)] md:p-6"
              >
                <Markdown>{REAL_REEXPLANATION}</Markdown>
              </div>
            </motion.div>
            <p className="fh-pretty text-[15px] leading-relaxed text-[var(--color-ink-soft)]">
              {c.reexplain.endsWithQuestion}
            </p>
          </div>
        </div>

        {/* The shape of what you just watched: four calm steps. */}
        <div className="mt-20 md:mt-28">
          <motion.p
            {...fadeUp(calm)}
            className="fh-display max-w-2xl text-xl leading-snug text-[var(--color-ink)] md:text-2xl"
          >
            {c.reexplain.shape}
          </motion.p>

          <ol className="mt-10 flex flex-col">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <motion.div
                  {...drawX(calm)}
                  className="h-px bg-[var(--color-line)]"
                />
                <motion.div
                  {...fadeUp(calm, calm ? 0 : i * 0.06)}
                  className="flex items-baseline gap-5 py-5 md:gap-7 md:py-6"
                >
                  <span className="fh-latin fh-display shrink-0 text-[clamp(2rem,4vw,3rem)] leading-none text-[var(--color-red)]/35">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="fh-display text-lg text-[var(--color-ink)] md:text-xl">{step.title}</h3>
                    <p className="fh-pretty mt-1.5 max-w-xl text-sm leading-relaxed text-[var(--color-ink-soft)] md:text-[15px]">
                      {step.body}
                    </p>
                  </div>
                </motion.div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
