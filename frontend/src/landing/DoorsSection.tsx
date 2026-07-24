/**
 * Act four: what Faheem does, as a calm sand-paper grid. Six capabilities,
 * each told situation-first in one breath, no carousel, no clutter.
 */
import { motion } from "motion/react";
import { Camera, BookOpen, ShieldCheck, NotebookPen, Compass, Search } from "lucide-react";
import { useCalm, fadeUp } from "./reveals";

const FEATURES = [
  {
    icon: Camera,
    title: "Photo the problem",
    body: "Question 7(b) has a diagram. Send a photo of the page and ask about it the way you would point across a desk.",
  },
  {
    icon: ShieldCheck,
    title: "Verified answers",
    body: "A second examiner pass re-reads every finished answer, checks facts and arithmetic, and substitutes results back in before you trust it.",
  },
  {
    icon: NotebookPen,
    title: "A notebook that writes itself",
    body: "Save the exact lines that made something click. They file themselves under the right chapter, ready for the night before the exam.",
  },
  {
    icon: BookOpen,
    title: "Deep understanding on demand",
    body: "One tap turns any answer into the full study view: exam-ready answer, analogy, worked example, common mistakes, and a check.",
  },
  {
    icon: Compass,
    title: "Your classroom profile",
    body: "Your grade, your curriculum, your analogy style. A grade 8 answer and an exam-prep answer are different answers, on purpose.",
  },
  {
    icon: Search,
    title: "Sources when it searches",
    body: "Questions about the current world are grounded in live search, and the answer cites where it came from, like good working shown.",
  },
];

export default function DoorsSection() {
  const calm = useCalm();

  return (
    <section id="features" className="landing-cv landing-cv-doors bg-page px-5 py-20 text-ink md:px-8 md:py-28" aria-label="What Faheem does">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <motion.p {...fadeUp(calm)} className="fhm-eyebrow fhm-eyebrow-ink">
            Everything a private tutor does
          </motion.p>
          <motion.h2 {...fadeUp(calm, calm ? 0 : 0.08)} className="kod-display landing-balance mt-4 text-[clamp(1.9rem,5vw,3rem)] leading-[1.1] text-ink">
            Patience, included as standard.
          </motion.h2>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} {...fadeUp(calm, calm ? 0 : (i % 3) * 0.08)} className="kod-card p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-gold-line bg-gold-pale/40 text-gold-deep">
                <f.icon size={18} strokeWidth={1.8} />
              </span>
              <h3 className="kod-display mt-5 text-lg leading-snug text-ink">{f.title}</h3>
              <p className="landing-pretty mt-2 text-[15px] leading-relaxed text-ink-dim">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
