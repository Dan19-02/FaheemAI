/**
 * Act four: the register. It is 11 pm and nobody is awake to check the
 * teacher's work, so the student's own doubt opens the act in her own words.
 * The honesty machinery answers as a chalk ledger on the blackboard surface,
 * the only tonal shift inside the night. A faint Arabic word leaks in
 * at the ledger's foot: the next act arriving early.
 */
import { motion } from "motion/react";
import { CheckCircle2 } from "lucide-react";
import { useCalm, fadeUp, drawX } from "./reveals";

const ROWS = [
  {
    title: "The whole answer, or nothing",
    body: "No word-by-word streaming theatre. Fahim writes the complete answer, checks it, and only then shows it to the student, whole.",
  },
  {
    title: "Deep-check, a second examiner",
    body: "One tap under any answer sends it to a second examiner pass that double-checks its facts and calculations. Slower, and worth it for the answers that matter.",
    chip: true,
  },
  {
    title: "It grades its own arithmetic",
    body: "Numerical answers end by plugging the result back into the equation. You can see it in the real answer above: the worked example closes with its own verification line.",
  },
  {
    title: "Sources, when it searches",
    body: "Questions about current facts are grounded in live Google Search, and the answer cites where it came from.",
  },
];

export default function RegisterSection() {
  const calm = useCalm();

  return (
    <section className="landing-cv landing-cv-register relative bg-night-soft px-4 py-20 md:px-8 md:py-28" aria-label="How Fahim stays honest">
      <div className="relative z-10 mx-auto max-w-6xl">
        <motion.p {...fadeUp(calm)} className="font-serif text-xl italic text-chalk md:text-2xl">
          <span lang="ar" dir="rtl" className="not-italic">وإذا أخطأ؟</span>
          <span className="ml-3 text-sm not-italic text-chalk-dim">But what if it gets it wrong?</span>
        </motion.p>

        <div className="mt-10 grid items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
          <div className="lg:sticky lg:top-16">
            <h2 className="landing-balance font-serif text-[clamp(2.1rem,5vw,3.25rem)] italic leading-tight tracking-[-0.01em] text-chalk">
              It would rather be right than fast.
            </h2>
            <p className="landing-pretty mt-5 max-w-lg text-[15px] leading-relaxed text-chalk-dim md:text-base">
              An AI that teaches students cannot afford to be confidently wrong.
              So this teacher is engineered to slow down in exactly the places
              where wrong answers hide.
            </p>
          </div>

          <div className="relative">
            {ROWS.map((row, i) => (
              <div key={row.title}>
                {i > 0 && <motion.div {...drawX(calm)} className="h-px origin-left bg-night-line" />}
                <div className="grid gap-2 py-6 md:grid-cols-[230px_1fr] md:gap-8 md:py-7">
                  <h3 className="font-serif text-lg italic leading-snug text-chalk">{row.title}</h3>
                  <div>
                    <p className="landing-pretty max-w-prose text-[15px] leading-relaxed text-chalk-dim">{row.body}</p>
                    {row.chip && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none mt-3 inline-flex items-center gap-1.5 rounded-full border border-editorial-sage bg-editorial-sage px-3 py-1.5 text-xs font-medium text-white select-none"
                      >
                        <CheckCircle2 size={13} /> Deep-check
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {/* The next act, leaking in early. */}
            <span
              lang="ar"
              dir="rtl"
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-8 right-0 select-none font-serif text-2xl text-chalk/20"
              style={{ transform: "rotate(-2deg)" }}
            >
              العربية
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
