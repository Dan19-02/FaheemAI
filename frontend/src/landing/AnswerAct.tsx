/**
 * Act two: the lamp turns on. The night never leaves; a pool of warm light
 * blooms, the real captured question sits alone inside it, and what comes
 * back is the page's first sheet of lit paper: the REAL answer, rendered by
 * the product's own components (Markdown + NotebookViewer), tabs explorable.
 * The gap between question and answer is deliberate: the answer arrives
 * whole when you reach it, never word by word.
 */
import { motion } from "motion/react";
import { Sparkles, BookMarked, CheckCircle2, Volume2 } from "lucide-react";
import { parseTeachingSections } from "../utils";
import { Markdown } from "../Markdown";
import { NotebookViewer } from "../NotebookViewer";
import { REAL_QUESTION, REAL_ANSWER } from "./realAnswer";
import { useCalm, fadeUp, sheetRise } from "./reveals";

const parsed = parseTeachingSections(REAL_ANSWER);

export default function AnswerAct() {
  const calm = useCalm();

  return (
    <section id="watch" className="relative overflow-hidden bg-night px-4 pb-20 md:px-8 md:pb-28" aria-label="A real answer from Fahim">
      {/* ---- The lamp turns on: the question, alone in the light ---- */}
      <div className="relative mx-auto flex min-h-[92svh] max-w-5xl flex-col items-center justify-center py-16">
        <div
          aria-hidden="true"
          className="lamp-pool pointer-events-none absolute left-1/2 top-1/2 -z-0 h-[min(120vw,760px)] w-[min(120vw,760px)] -translate-x-1/2 -translate-y-1/2"
        />
        <div className="relative z-10 w-full max-w-xl">
          <motion.p
            {...fadeUp(calm)}
            className="landing-balance text-center font-serif text-[clamp(1.6rem,4vw,2.5rem)] italic leading-snug text-chalk"
          >
            Except tonight, the panic never arrives. Tonight you have a catch-net.
          </motion.p>

          <motion.div {...sheetRise(calm)} className="mt-12 flex flex-col items-end">
            <div className="mb-1 text-[10px] text-chalk-dim">You, at 11:04 pm</div>
            <div className="lit-sheet max-w-[92%] rounded-2xl rounded-tr-sm border border-editorial-line bg-editorial-stone p-4 text-sm text-editorial-charcoal md:p-5 md:text-base">
              {REAL_QUESTION}
            </div>
          </motion.div>

          <motion.p
            {...fadeUp(calm, calm ? 0 : 0.15)}
            className="landing-pretty mx-auto mt-12 max-w-md text-center text-[15px] leading-relaxed text-chalk-dim"
          >
            You type the sentence exactly as you heard it. You do not have to
            phrase it well. Then the teacher writes the whole answer, checks it,
            and only then shows you. All at once. No word by word theatre.
          </motion.p>
        </div>
      </div>

      {/* ---- Paper held up in the dark: the real answer ---- */}
      <div className="relative z-10 mx-auto max-w-5xl">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <h2 className="landing-balance max-w-xl font-serif text-[clamp(2.1rem,5.5vw,3.5rem)] italic leading-tight tracking-[-0.01em] text-chalk">
            What comes back is not a chat. It is a lesson.
          </h2>
          <p className="landing-pretty max-w-xs font-serif text-base italic leading-relaxed text-chalk-dim">
            There it is again. Third time today. First time it stays still.
          </p>
        </div>

        <p className="mt-6 text-[13px] tracking-wide text-chalk-dim">
          This is the product, not a picture of it. Open the tabs.
        </p>

        <motion.div {...sheetRise(calm)} className="lit-sheet mt-4 rounded-3xl bg-editorial-ivory p-4 text-editorial-charcoal sm:p-6 md:p-8">
          <div className="mb-3 flex items-center gap-2 text-[10px] text-editorial-charcoal/70">
            <span>Fahim</span>
            <span>&middot;</span>
            <span>generated live, unedited</span>
          </div>
          <div className="text-sm leading-relaxed md:text-base">
            {parsed.preamble && (
              <div className="mb-3">
                <Markdown>{parsed.preamble}</Markdown>
              </div>
            )}
            <NotebookViewer sections={parsed.sections} />
            {/* The real deep-view action row: one wrapping cluster, Listen
                floats right only at sm+. Kept in step with App.tsx so this
                shows today's product, not a past version of it. The Still
                fuzzy chip breathes: the page's one deliberate loop. */}
            <div aria-hidden="true" className="pointer-events-none mt-3 flex flex-wrap items-center gap-1.5 border-t border-editorial-line-light pt-2.5 select-none">
              <span className="landing-breathe flex items-center gap-1.5 whitespace-nowrap rounded-full border border-editorial-line-light bg-editorial-stone px-3 py-1 text-xs text-editorial-sage">
                <Sparkles size={12} /> Still fuzzy?
              </span>
              <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-editorial-line-light bg-editorial-stone px-3 py-1 text-xs text-editorial-sage">
                <CheckCircle2 size={12} /> Deep-check
              </span>
              <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-editorial-line-light bg-editorial-stone px-3 py-1 text-xs text-editorial-sage">
                <BookMarked size={12} /> Save lines
              </span>
              <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-editorial-line-light bg-editorial-stone px-3 py-1 text-xs text-editorial-sage sm:ml-auto">
                <Volume2 size={12} /> Listen
              </span>
            </div>
          </div>
        </motion.div>

        <p className="mt-4 text-center text-[13px] leading-relaxed text-chalk-dim">
          Generated by Fahim on 2 July 2026 for a Grade 10 profile in English.
          Nothing above was staged or edited: the flowchart, the quick-check
          question, the shopping&#8209;cart analogy, all of it came from the teacher.
        </p>
      </div>
    </section>
  );
}
