/**
 * Visual notebook: parses structured teacher responses into a swipeable card
 * deck: one idea per slide. Students swipe (or drag) to advance rather than
 * clicking through tabs. Shared by the study workspace (App.tsx) and the
 * landing page's live demo, so what visitors see on the landing page IS the
 * product component.
 */
import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion, PanInfo } from "motion/react";
import { NotebookSection } from "./utils";
import { Markdown } from "./Markdown";

interface NotebookViewerProps {
  sections: NotebookSection[];
}

/** One-line hints per notebook section. Keyed on a normalized name so minor
 *  wording drift in the model's headers still matches; unknown sections fall
 *  back to a generic line. Shown as the card's sub-header so each slide says
 *  what it is for. */
const SECTION_HINTS: [RegExp, string][] = [
  [/big idea/i, "The one core idea everything else builds on"],
  [/analogy/i, "The concept in a picture from everyday life"],
  [/simple explanation/i, "The plain, step-by-step walkthrough"],
  [/visual/i, "A diagram of how it all fits together"],
  [/formal definition/i, "The exact wording exams expect"],
  [/worked example/i, "One problem solved step by step"],
  [/common mistakes/i, "The slips that cost marks, and how to avoid them"],
  [/quick check/i, "One small question to test yourself"],
  [/summary/i, "The whole idea in one line to remember"],
];
const sectionHint = (title: string): string =>
  SECTION_HINTS.find(([re]) => re.test(title))?.[1] || "This part of the notebook";

// A swipe counts once it clears this much horizontal travel OR is thrown fast
// enough: either a deliberate drag or a quick flick advances the card.
const SWIPE_DISTANCE = 60;
const SWIPE_VELOCITY = 400;

// Cards enter from the direction of travel and exit the opposite way, so the
// deck reads as one strip sliding under the frame. `dir` is passed via `custom`.
const cardVariants = {
  enter: (d: number) => ({ opacity: 0, x: d > 0 ? 40 : d < 0 ? -40 : 0 }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: d > 0 ? -40 : 40, position: "absolute" as const }),
};

export function NotebookViewer({ sections }: NotebookViewerProps) {
  // idx is the current card; dir remembers which way we last moved so the
  // enter/exit animation slides in the direction of travel.
  const [[idx, dir], setState] = useState<[number, number]>([0, 0]);
  const stageRef = useRef<HTMLDivElement>(null);

  const count = sections.length;
  const clamped = Math.min(idx, count - 1);
  // Functional updates so rapid inputs (two arrow presses, a fast swipe) each
  // compound off the live index instead of a stale render-time closure.
  const step = (delta: number) =>
    setState(([cur]) => {
      const n = cur + delta;
      return n < 0 || n >= count ? [cur, delta] : [n, delta];
    });
  const jump = (i: number) =>
    setState(([cur]) => (i < 0 || i >= count ? [cur, 0] : [i, i > cur ? 1 : -1]));
  const prev = () => step(-1);
  const next = () => step(1);

  // Arrow keys drive the deck when it's the focused surface: desktop students
  // (and testers) shouldn't have to reach for the mouse. Re-subscribes only
  // when the deck size changes (the handler's bounds check closes over count),
  // not on every parent re-render.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { next(); }
      else if (e.key === "ArrowLeft") { prev(); }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) next();
    else if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) prev();
  };

  const active = sections[clamped];

  return (
    <div className="flex flex-col gap-4 max-w-full my-1">
      <div className="bg-editorial-stone border border-editorial-line-light border-t-2 border-t-editorial-sage/40 p-3 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={15} className="text-editorial-sage shrink-0" />
          <span className="text-xs font-semibold text-editorial-charcoal">Study Notebook</span>
        </div>
        <span className="text-[10px] text-white font-medium bg-editorial-sage px-2.5 py-0.5 rounded-full">{count} cards</span>
      </div>

      {/* Swipe stage. tabIndex makes it keyboard-focusable for arrow-key nav. */}
      <div
        ref={stageRef}
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label="Study notebook cards. Swipe or use arrow keys."
        className="relative outline-none select-none"
      >
        <div className="relative overflow-hidden min-h-[300px] md:min-h-[280px]">
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            <motion.div
              key={clamped}
              custom={dir}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.16}
              onDragEnd={onDragEnd}
              variants={cardVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.26, ease: [0.22, 0.61, 0.36, 1] }}
              className="w-full bg-surface border border-editorial-line-light border-t-2 border-t-editorial-sage/25 rounded-2xl p-5 md:p-6 flex flex-col gap-2 min-w-0 max-w-full cursor-grab active:cursor-grabbing"
            >
              {active && (
                <div className="flex flex-col h-full">
                  <div className="flex items-start gap-3 pb-3 border-b border-editorial-line-light mb-3">
                    <span className="text-2xl leading-none shrink-0">{active.emoji}</span>
                    <div className="min-w-0">
                      <h3 className="text-sm kod-display font-bold text-editorial-charcoal">{active.title}</h3>
                      <p className="text-[11px] text-editorial-charcoal/55 mt-0.5">{sectionHint(active.title)}</p>
                    </div>
                  </div>
                  <div className="max-w-full overflow-x-auto pointer-events-auto">
                    <Markdown>{active.content}</Markdown>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Dots + arrows. Dots double as a progress bar and a tap target; the
            headline interaction is the swipe, arrows are the desktop fallback. */}
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={prev}
            disabled={clamped === 0}
            aria-label="Previous card"
            className="grid place-items-center h-8 w-8 rounded-full bg-editorial-stone hover:bg-editorial-sage/10 text-editorial-charcoal hover:text-editorial-sage border border-editorial-line-light disabled:opacity-25 disabled:cursor-default cursor-pointer transition-colors"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex items-center gap-1.5">
            {sections.map((_, i) => (
              <button
                key={i}
                onClick={() => jump(i)}
                aria-label={`Go to card ${i + 1}`}
                aria-current={i === clamped}
                className={`rounded-full transition-all cursor-pointer ${
                  i === clamped ? "w-5 h-1.5 bg-editorial-sage" : "w-1.5 h-1.5 bg-editorial-line-light hover:bg-editorial-sage/40"
                }`}
              />
            ))}
          </div>

          <button
            onClick={next}
            disabled={clamped === count - 1}
            aria-label="Next card"
            className="grid place-items-center h-8 w-8 rounded-full bg-editorial-stone hover:bg-editorial-sage/10 text-editorial-charcoal hover:text-editorial-sage border border-editorial-line-light disabled:opacity-25 disabled:cursor-default cursor-pointer transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="mt-2 text-center text-[10px] text-editorial-charcoal/45">
          {clamped === 0 ? "Swipe to move through the cards →" : `Card ${clamped + 1} of ${count}`}
        </div>
      </div>
    </div>
  );
}
