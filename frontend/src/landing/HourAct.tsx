/**
 * Act one: the hour. The page opens at 11:04 pm, the hour Fahim was
 * built for. One phrase, the story's protagonist, drifts across the dark;
 * a thin lamplight glow intrudes from the bottom edge, promising a light
 * source not yet seen. Then the filmstrip: the day that got the student
 * here, replayed as three timestamped vignettes in the same unbroken night.
 */
import { motion } from "motion/react";
import { ArrowDown } from "lucide-react";
import { DRIFT_WORDS } from "./words";
import { useCalm, fadeUp, stamp, EASE } from "./reveals";
import ScatterWords from "./ScatterWords";
import type { AuthMode } from "./Landing";

interface HourActProps {
  onAuth: (mode: AuthMode) => void;
}

/** The one drifting phrase: the sentence the whole page follows. */
const PHRASE = DRIFT_WORDS[0];

const VIGNETTES = [
  {
    time: "10:14 am",
    lines:
      "The teacher says “rate of change of momentum”, taps the board twice, and moves on.",
    mirrored: false,
  },
  {
    time: "10:15 am",
    lines: "Half the class nods. You copy the words down, hoping they will make sense tonight.",
    mirrored: true,
  },
  {
    time: "11:02 pm",
    lines: "They do not. And the old feeling reaches for you: the quiet panic of falling behind.",
    mirrored: false,
  },
];

export default function HourAct({ onAuth }: HourActProps) {
  const calm = useCalm();

  const enter = (delay: number) =>
    calm
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.8, delay, ease: EASE },
        };

  return (
    <div className="bg-night">
      {/* ---- The hour ---- */}
      <section className="relative flex min-h-[100svh] flex-col overflow-hidden">
        <header className="relative z-10 flex items-center justify-between gap-3 px-5 py-5 md:px-10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-editorial-sage">
              <span className="font-serif text-lg italic leading-none text-editorial-ivory">ف</span>
            </div>
            <span className="font-serif text-lg italic tracking-tight text-chalk">فهيم</span>
          </div>
          <nav className="flex items-center gap-2 md:gap-6" aria-label="Main">
            <a href="#watch" className="hidden text-sm text-chalk-dim transition-colors hover:text-chalk focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sage-bright md:block">
              Watch it teach
            </a>
            <a href="#pricing" className="hidden text-sm text-chalk-dim transition-colors hover:text-chalk focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sage-bright md:block">
              Pricing
            </a>
            <button
              onClick={() => onAuth("login")}
              className="rounded-full border border-night-line px-4 py-2 text-sm text-chalk transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-bright"
            >
              Sign in
            </button>
            <button
              onClick={() => onAuth("signup")}
              className="hidden rounded-full bg-sage-bright px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-bright sm:block"
            >
              Start free
            </button>
          </nav>
        </header>

        {/* Lamplight from the next act, intruding at the bottom edge. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-32"
          style={{ background: "linear-gradient(to top, rgba(240, 238, 226, 0.07), transparent)" }}
        />

        {/* The protagonist phrase drifts in whatever dark the viewport has to
            spare: the zone absorbs all leftover hero space, so the phrase can
            never collide with the reading block below it. */}
        <div aria-hidden="true" className="pointer-events-none relative min-h-6 flex-1 select-none overflow-hidden">
          <span
            className="landing-drift absolute whitespace-nowrap font-serif italic text-chalk"
            style={{
              top: "calc(50% - 0.7em)",
              right: "8%",
              opacity: 0.3,
              fontSize: "clamp(1rem, 2.2vw, 1.5rem)",
              filter: "blur(0.7px)",
              ["--dur" as string]: PHRASE.dur,
              ["--delay" as string]: PHRASE.delay,
              ["--dx" as string]: PHRASE.dx,
              ["--dy" as string]: PHRASE.dy,
              ["--rot" as string]: PHRASE.rot,
            }}
          >
            {PHRASE.text}
          </span>
        </div>

        <div className="relative z-[1] flex flex-col justify-end px-6 pb-24 pt-4 md:px-12 lg:px-20">
          <div className="max-w-3xl">
            <motion.p {...enter(0.15)} className="font-serif text-lg italic text-chalk-dim md:text-xl">
              Physics was six hours ago. The sentence is still not making sense.
            </motion.p>
            <motion.h1
              id="hero-title"
              tabIndex={-1}
              {...enter(0.5)}
              className="mt-3 font-serif text-[clamp(4.2rem,15vw,9rem)] italic leading-none tracking-[-0.02em] text-chalk focus:outline-none"
            >
              11:04 pm.
              <span className="sr-only">
                {" "}The hour Fahim was built for: a patient AI teacher and doubt solver for Bahrain MoE, CBSE and Cambridge students in grades 9 to 12.
              </span>
            </motion.h1>
            <motion.p
              {...enter(0.95)}
              className="landing-pretty mt-6 max-w-xl text-base leading-relaxed text-chalk-dim md:text-lg"
            >
              This is the hour Fahim was built for: a patient AI teacher that
              takes the exact sentence that flew past you in class and explains it
              again, a different way each time, until it lands. Bahrain MoE, CBSE
              and Cambridge, grades 9 to 12.
            </motion.p>
            <motion.div {...enter(1.25)} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={() => onAuth("signup")}
                className="w-full rounded-full bg-sage-bright px-8 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-bright sm:w-auto"
              >
                Start free tonight
              </button>
              <a
                href="#watch"
                className="w-full rounded-full border border-night-line px-8 py-3.5 text-center text-sm font-medium text-chalk transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-bright sm:w-auto"
              >
                Watch it teach
              </a>
            </motion.div>
            <motion.p {...enter(1.6)} className="mt-7 text-[13px] tracking-wide text-chalk-dim">
              <span lang="ar">العربية</span> &middot; English
            </motion.p>
          </div>
        </div>

        <motion.div
          aria-hidden="true"
          className="absolute bottom-7 left-1/2 -translate-x-1/2 text-chalk-dim"
          {...(calm
            ? {}
            : { animate: { y: [0, 7, 0] }, transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" } })}
        >
          <ArrowDown size={18} />
        </motion.div>
      </section>

      {/* ---- The day that got you here ---- */}
      <section aria-label="The day that got you here" className="relative overflow-hidden">
        <ScatterWords />
        <div className="relative z-10 mx-auto max-w-6xl px-6 md:px-12">
          {VIGNETTES.map((v) => (
            <div
              key={v.time}
              className={`flex min-h-[58svh] items-center ${v.mirrored ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-xl ${v.mirrored ? "text-right" : "text-left"}`}>
                <motion.p
                  {...stamp(calm)}
                  className="font-serif text-[clamp(2.2rem,6vw,4rem)] italic leading-none text-chalk-dim"
                >
                  {v.time}
                </motion.p>
                <motion.p
                  {...fadeUp(calm, calm ? 0 : 0.1)}
                  className="landing-balance mt-4 font-serif text-[clamp(1.4rem,3.2vw,2.1rem)] italic leading-snug text-chalk"
                >
                  {v.lines}
                </motion.p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
