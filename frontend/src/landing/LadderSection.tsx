/**
 * Act three: it stays until it lands. Proof before pitch: the REAL
 * re-explanation captured from the live product comes first, as a second,
 * smaller sheet of lit paper. Only after the visitor has watched it work do
 * the five rungs name the shape of what they just saw, as a chalk ledger.
 */
import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { Markdown } from "../Markdown";
import { REAL_REEXPLANATION, REAL_STILL_FUZZY_PROMPT } from "./realAnswer";
import { useCalm, fadeUp, sheetRise, drawX } from "./reveals";

const RUNGS = [
  {
    title: "Gut feeling first",
    body: "It starts again from what the idea feels like, not from what it is called.",
  },
  {
    title: "A fresh analogy",
    body: "A new comparison from your own world: football, cooking, shopping carts. Never the same one twice.",
  },
  {
    title: "The smallest step, with a picture",
    body: "One tiny piece at a time, usually with a diagram it draws for you on the spot.",
  },
  {
    title: "A worked micro-example",
    body: "Numbers small enough to hold in your head, worked from start to finish.",
  },
  {
    title: "Pinpoint the gap",
    body: "A gentle question that finds the exact sentence where things stopped making sense.",
  },
];

export default function LadderSection() {
  const calm = useCalm();

  return (
    <section id="how" className="landing-cv landing-cv-ladder relative bg-night px-4 py-20 md:px-8 md:py-28" aria-label="How Fahim stays until it lands">
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
          {/* The pitch, hanging in the dark while the proof glows beside it */}
          <div className="lg:sticky lg:top-16">
            <h2 className="landing-balance font-serif text-[clamp(2.1rem,5vw,3.25rem)] italic leading-tight tracking-[-0.01em] text-chalk">
              It stays until it lands.
            </h2>
            <p className="landing-pretty mt-5 max-w-lg text-[15px] leading-relaxed text-chalk-dim md:text-base">
              Understanding rarely arrives on the first try, and Fahim is
              built around that truth. Under every answer sits one small button:
            </p>
            <span
              aria-hidden="true"
              className="pointer-events-none mt-5 inline-flex items-center gap-1.5 rounded-full border border-editorial-line-light bg-editorial-stone px-4 py-2 text-sm text-editorial-sage select-none"
            >
              <Sparkles size={14} /> Still fuzzy?
            </span>
            <p className="landing-pretty mt-5 max-w-lg text-[15px] leading-relaxed text-chalk-dim md:text-base">
              One tap. You never have to put your confusion into words. While
              building this page we tapped it on the Newton answer above. The
              live teacher slowed down, dropped the formula, and changed the
              analogy entirely. Unedited:
            </p>
          </div>

          {/* The proof: the real re-explanation, a smaller lit sheet */}
          <div className="flex flex-col gap-4">
            <motion.div {...sheetRise(calm)} className="flex flex-col items-end">
              <div className="mb-1 text-[10px] text-chalk-dim">You, with one tap</div>
              <div className="lit-sheet max-w-[92%] rounded-2xl rounded-tr-sm border border-editorial-line bg-editorial-stone p-4 text-sm text-editorial-charcoal md:max-w-[80%]">
                {REAL_STILL_FUZZY_PROMPT}
              </div>
            </motion.div>
            <motion.div {...sheetRise(calm)} className="flex flex-col items-start">
              <div className="mb-1 text-[10px] text-chalk-dim">Fahim &middot; unedited</div>
              <div
                tabIndex={0}
                role="region"
                aria-label="The real re-explanation from Fahim, scrollable"
                className="lit-sheet max-h-[460px] w-full min-w-0 overflow-y-auto rounded-2xl rounded-tl-sm bg-editorial-ivory p-4 text-sm leading-relaxed text-editorial-charcoal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-bright md:p-5"
              >
                <Markdown>{REAL_REEXPLANATION}</Markdown>
              </div>
            </motion.div>
            <p className="landing-pretty font-serif text-base italic leading-relaxed text-chalk-dim">
              The real reply ends with a question: &ldquo;Want to try the football
              question now...&rdquo; It will wait for your answer. It always waits.
            </p>
          </div>
        </div>

        {/* The shape of what you just watched: five rungs, chalk on night */}
        <div className="mt-20 md:mt-28">
          <motion.p {...fadeUp(calm)} className="landing-balance max-w-2xl font-serif text-xl italic leading-snug text-chalk md:text-2xl">
            What you just watched has a shape. The teacher climbs down five rungs,
            as many as you need, and it never repeats itself, never sighs, never
            moves on while you are lost.
          </motion.p>

          <ol className="mt-10 flex flex-col">
            {RUNGS.map((rung, i) => (
              <li key={rung.title} style={{ marginLeft: `calc(${i} * min(1.8rem, 2.5vw))` }}>
                <motion.div
                  {...drawX(calm)}
                  className="h-px origin-left bg-night-line"
                />
                <motion.div {...fadeUp(calm, calm ? 0 : i * 0.06)} className="flex items-baseline gap-5 py-5 md:gap-7 md:py-6">
                  <span className="font-serif text-[clamp(2.2rem,4vw,3.2rem)] italic leading-none text-chalk/45">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-serif text-lg italic text-chalk md:text-xl">{rung.title}</h3>
                    <p className="landing-pretty mt-1.5 max-w-xl text-sm leading-relaxed text-chalk-dim md:text-[15px]">
                      {rung.body}
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
