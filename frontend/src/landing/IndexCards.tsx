/**
 * Act five: two index cards. The same physics idea, asked to the live
 * product twice, once in each language: pocket-sized paper in the
 * dark, slightly fanned. Boards and the ways in follow as quiet chalk rows.
 * The language showcase quotes REAL captured answers (see realAnswer.ts
 * for capture provenance).
 */
import { motion } from "motion/react";
import { Camera, Mic, Compass } from "lucide-react";
import { REAL_VOICES } from "./realAnswer";
import { useCalm, fadeUp, sheetRise } from "./reveals";

const BOARDS = ["Bahrain MoE", "CBSE", "Cambridge", "General Study"];

const WAYS = [
  {
    icon: Camera,
    title: "Photo doubts",
    body: "Stuck on a printed problem? Send a photo of the page and ask.",
  },
  {
    icon: Mic,
    title: "Voice sessions",
    body: "Talk it through out loud, like a tuition session that never checks the clock.",
  },
  {
    icon: Compass,
    title: "Your analogy world",
    body: "Football brain? Cooking brain? Choose the world your examples come from.",
  },
];

const FAN = ["lg:-rotate-[1.5deg]", "lg:rotate-[1.5deg]"];

export default function IndexCards() {
  const calm = useCalm();

  return (
    <section className="landing-cv landing-cv-cards relative bg-night px-4 pb-10 pt-20 md:px-8 md:pt-28" aria-label="Made for every classroom in Bahrain">
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <h2 className="landing-balance font-serif text-[clamp(2.1rem,5vw,3.25rem)] italic leading-tight tracking-[-0.01em] text-chalk">
            It knows which classroom you sit in.
          </h2>
          <p className="landing-pretty mt-5 text-[15px] leading-relaxed text-chalk-dim md:text-base">
            Tell it your board, your grade from 9 to 12, your language, and the
            analogies that make sense in your life. One physics idea, asked to
            the live teacher twice on 2 July 2026, once in each language:
          </p>
        </div>

        {/* Three real answers: pocket paper in the dark */}
        <div className="mt-12 flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
          {REAL_VOICES.map((v, i) => (
            <motion.div
              key={v.tag}
              {...sheetRise(calm)}
              className={`lit-sheet flex-1 rounded-2xl bg-editorial-ivory p-6 md:p-7 ${FAN[i] ?? ""}`}
            >
              <span
                lang={v.lang}
                dir={v.lang === "ar" ? "rtl" : undefined}
                className={`text-xs font-semibold text-editorial-sage ${v.lang === "ar" ? "block text-right" : ""}`}
              >
                {v.tag}
              </span>
              <p
                lang={v.lang}
                dir={v.lang === "ar" ? "rtl" : undefined}
                className={`landing-pretty mt-3 font-serif text-lg leading-relaxed text-editorial-charcoal md:text-xl ${v.lang === "ar" ? "text-right not-italic" : "italic"}`}
              >
                &ldquo;{v.line}&rdquo;
              </p>
            </motion.div>
          ))}
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-chalk-dim">
          One question, asked to the live teacher twice on 2 July 2026, once
          in each language. Both the Arabic and English lines are complete
          answers, unedited.
        </p>

        <div className="mt-14 flex flex-col gap-10 md:flex-row md:items-start md:justify-between md:gap-16">
          {/* Boards */}
          <div>
            <p className="text-sm font-semibold text-chalk">Tuned to your board and exam</p>
            <ul className="mt-3 flex max-w-md flex-wrap gap-2">
              {BOARDS.map((b) => (
                <li key={b} className="rounded-full border border-night-line px-4 py-1.5 text-sm text-chalk-dim">
                  {b}
                </li>
              ))}
            </ul>
          </div>

          {/* Ways in */}
          <div className="flex flex-1 flex-col gap-5 md:max-w-xl">
            {WAYS.map((w) => (
              <motion.div key={w.title} {...fadeUp(calm)} className="flex items-start gap-4">
                <w.icon size={16} className="mt-1 shrink-0 text-chalk-dim" aria-hidden="true" />
                <p className="landing-pretty text-[15px] leading-relaxed text-chalk-dim">
                  <strong className="font-semibold text-chalk">{w.title}.</strong> {w.body}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
