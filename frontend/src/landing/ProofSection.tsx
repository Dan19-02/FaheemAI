/**
 * PROOF — the payoff of the accuracy promise, and the hero beat of the page.
 *
 * The hero claimed accuracy against the exact Bahrain curriculum, in Arabic.
 * Here we prove it: a real student question (in Arabic, imperfect phrasing),
 * then the REAL answer rendered by the product's OWN components (Markdown +
 * NotebookViewer). The sea-teal curriculum-source chip does not just appear —
 * it settles in — because accuracy is the product. This runs on a deep-sea
 * night surface so the pearl answer sheet reads as light held up in the dark.
 *
 * Nothing here is a mockup: the flowchart, the table, the quick-check question
 * and the self-verification line all came from the live teacher.
 */
import { motion } from "motion/react";
import { BookMarked, CheckCircle2, Sparkles, Volume2 } from "lucide-react";
import { parseTeachingSections } from "../utils";
import { Markdown } from "../Markdown";
import { NotebookViewer } from "../NotebookViewer";
import {
  REAL_QUESTION,
  REAL_ANSWER,
  REAL_SOURCE,
} from "./realAnswer";
import { useCalm, fadeUp, sheetRise, bubbleIn } from "./reveals";
import { useLandingCopy } from "./copy";

const parsed = parseTeachingSections(REAL_ANSWER);

export default function ProofSection() {
  const calm = useCalm();
  const { c } = useLandingCopy();

  return (
    <section
      id="proof"
      className="fh-cv fh-cv-proof fh-night-wash relative overflow-hidden bg-[var(--color-night)] px-5 py-20 text-[var(--color-chalk)] md:px-8 md:py-28"
      aria-label={c.proof.ariaLabel}
    >
      <div className="relative z-10 mx-auto max-w-5xl">
        {/* The turn: from claim to proof. */}
        <motion.p {...fadeUp(calm)} className="text-sm font-bold tracking-wide text-[var(--color-gold)]">
          {c.proof.kicker}
        </motion.p>
        <motion.h2
          {...fadeUp(calm, calm ? 0 : 0.05)}
          className="fh-display mt-3 max-w-3xl text-[clamp(2rem,5.5vw,3.4rem)] text-[var(--color-chalk)]"
        >
          {c.proof.title}
        </motion.h2>
        <motion.p
          {...fadeUp(calm, calm ? 0 : 0.1)}
          className="fh-pretty mt-5 max-w-2xl text-[15px] leading-relaxed text-[var(--color-chalk-dim)] md:text-base"
        >
          {c.proof.para}
        </motion.p>

        {/* The conversation: student question, then the grounded answer sheet. */}
        <div className="mt-12 flex flex-col gap-5">
          {/* Student bubble — sits at the start (right) in RTL. */}
          <motion.div {...bubbleIn(calm, 18)} className="flex flex-col items-start">
            <div className="mb-1.5 px-1 text-[11px] text-[var(--color-chalk-dim)]">{c.proof.youLabel}</div>
            <div dir="rtl" lang="ar" className="faheem-bubble-user max-w-[92%] rounded-tr-md px-4 py-3 text-[15px] leading-relaxed md:max-w-[75%] md:text-base">
              {REAL_QUESTION}
            </div>
          </motion.div>

          {/* The answer sheet: the product's own renderer, pearl paper glowing. */}
          <motion.div {...sheetRise(calm)} className="flex flex-col items-end">
            <div className="mb-1.5 px-1 text-[11px] text-[var(--color-chalk-dim)]">
              {c.proof.faheemLabel}
            </div>
            <div dir="rtl" lang="ar" className="faheem-card w-full max-w-full overflow-hidden bg-[var(--color-pearl)] p-4 text-[var(--color-ink)] sm:p-6 md:p-8">
              {/* The curriculum-source trust chip — the hero interaction. */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="fh-source-chip">
                  <BookMarked size={13} aria-hidden="true" />
                  {REAL_SOURCE.board}
                </span>
                <span className="fh-source-chip">
                  <CheckCircle2 size={13} aria-hidden="true" />
                  {REAL_SOURCE.unit}
                </span>
              </div>

              <div className="text-sm leading-relaxed md:text-base">
                {parsed.preamble && (
                  <div className="mb-3">
                    <Markdown>{parsed.preamble}</Markdown>
                  </div>
                )}
                <NotebookViewer sections={parsed.sections} />

                {/* The real deep-view action row (kept in step with the app).
                    "ما زال غير واضح؟" breathes: the page's one deliberate loop,
                    and the bridge into the next section. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--color-line-soft)] pt-2.5 select-none"
                >
                  <span className="fh-breathe flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--color-line-soft)] bg-[var(--color-sand)] px-3 py-1 text-xs font-semibold text-[var(--color-red)]">
                    <Sparkles size={12} /> {c.proof.chipStillUnclear}
                  </span>
                  <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--color-line-soft)] bg-[var(--color-sand)] px-3 py-1 text-xs font-semibold text-[var(--color-sea)]">
                    <CheckCircle2 size={12} /> {c.proof.chipDeepCheck}
                  </span>
                  <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--color-line-soft)] bg-[var(--color-sand)] px-3 py-1 text-xs font-semibold text-[var(--color-sea)]">
                    <BookMarked size={12} /> {c.proof.chipSaveLines}
                  </span>
                  <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--color-line-soft)] bg-[var(--color-sand)] px-3 py-1 text-xs font-semibold text-[var(--color-sea)] sm:mr-auto">
                    <Volume2 size={12} /> {c.proof.chipListen}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.p
          {...fadeUp(calm)}
          className="fh-pretty mt-5 text-[13px] leading-relaxed text-[var(--color-chalk-dim)]"
        >
          {c.proof.captureNote}
        </motion.p>
      </div>
    </section>
  );
}
