/**
 * Act one: the midnight hero. Faheem's name IS the promise, so the hero
 * leads with it: فهيم, "the one who understands". A khatam-lattice night
 * sky, one lamp-gold action, three quiet proof figures, and the three-beat
 * "how it feels" strip that opens the loop the rest of the page closes.
 */
import { motion } from "motion/react";
import { ThemeToggle } from "../ThemeToggle";
import { useCalm, fadeUp, EASE } from "./reveals";
import type { AuthMode } from "./Landing";

interface HeroProps {
  onAuth: (mode: AuthMode) => void;
}

/** The Faheem mark: an eight-point star drawn as two soft-cornered squares. */
export function FaheemMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="12" y="12" width="24" height="24" rx="5" stroke="var(--color-gold-bright)" strokeWidth="2.6" />
      <rect x="12" y="12" width="24" height="24" rx="5" stroke="var(--color-gold-bright)" strokeWidth="2.6" transform="rotate(45 24 24)" opacity="0.75" />
      <circle cx="24" cy="24" r="3.4" fill="var(--color-gold-bright)" />
    </svg>
  );
}

const PROOF = [
  { big: "9.62 / 10", small: "highest accuracy of nine systems in our blind evaluations" },
  { big: "14 curricula", small: "Cambridge and IB to every Gulf ministry syllabus" },
  { big: "Grades 6–12", small: "every subject, plus entrance-exam preparation" },
];

const BEATS = [
  {
    n: "١",
    title: "Ask as you are",
    body: "Half a sentence, a photo of the problem, the exact words in your head. Phrasing it well was never your job.",
  },
  {
    n: "٢",
    title: "Re-taught, never repeated",
    body: "If it doesn't land, Faheem tries a new door: a fresh analogy, a smaller step, a worked example. As many times as you need.",
  },
  {
    n: "٣",
    title: "Proven understood",
    body: "Every answer is checked by a second examiner pass, and a concept only counts as yours after you use it correctly on a later day.",
  },
];

export default function HourAct({ onAuth }: HeroProps) {
  const calm = useCalm();
  const enter = (delay: number) =>
    calm ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay, ease: EASE } };

  const navLink =
    "hidden text-sm font-medium text-chalk-dim transition-colors hover:text-gold-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-bright md:block";

  return (
    <div className="fhm-night">
      {/* ---- Header ---- */}
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-6 md:px-8">
        <div className="flex items-center gap-3">
          <FaheemMark />
          <div className="flex items-baseline gap-2">
            <span className="kod-display text-xl tracking-tight text-chalk">Faheem</span>
            <span lang="ar" className="fhm-arabic text-lg leading-none text-gold-bright">فهيم</span>
          </div>
        </div>
        <nav className="flex items-center gap-3 md:gap-7" aria-label="Main">
          <a href="#watch" className={navLink}>A real answer</a>
          <a href="#features" className={navLink}>What Faheem does</a>
          <a href="#why" className={navLink}>Why Faheem</a>
          <a href="#pricing" className={navLink}>Pricing</a>
          {/* Below md the nav links hide; parents look for the price first,
              so Pricing keeps a visible seat next to the toggle. */}
          <a href="#pricing" className="text-sm font-medium text-chalk-dim transition-colors hover:text-gold-bright md:hidden">
            Pricing
          </a>
          <ThemeToggle />
          <button onClick={() => onAuth("login")} className="fhm-ghost-night px-4 py-2 text-sm">
            Sign in
          </button>
          <button onClick={() => onAuth("signup")} className="kod-btn hidden px-4 py-2 text-sm sm:block">
            Try Faheem free
          </button>
        </nav>
      </header>

      {/* ---- Hero ---- */}
      <section className="relative mx-auto max-w-6xl px-5 pb-16 pt-14 md:px-8 md:pb-24 md:pt-24">
        <div aria-hidden="true" className="fhm-glow left-1/2 top-6 h-72 w-72 -translate-x-1/2 opacity-60 md:left-[68%]" />
        <div className="relative mx-auto max-w-3xl text-center">
          <motion.p {...enter(0.05)} className="fhm-eyebrow">
            The AI tutor built for Gulf classrooms
          </motion.p>
          <motion.h1
            id="hero-title"
            tabIndex={-1}
            {...(calm
              ? {}
              : {
                  initial: { opacity: 0, filter: "blur(8px)", y: 14 },
                  animate: { opacity: 1, filter: "blur(0px)", y: 0 },
                  transition: { duration: 1, delay: 0.15, ease: EASE },
                })}
            className="kod-display landing-balance mt-5 text-[clamp(2.6rem,7vw,4.6rem)] leading-[1.04] text-chalk focus:outline-none"
          >
            Understood.
            <br />
            <span className="text-gold-bright">Not memorised.</span>
          </motion.h1>
          <motion.p {...enter(0.3)} className="landing-pretty mx-auto mt-6 max-w-2xl text-base leading-relaxed text-chalk-dim md:text-lg">
            Faheem, <span lang="ar" className="fhm-arabic text-gold-bright">فهيم</span>, is Arabic for{" "}
            <em className="text-chalk">the one who understands</em>. A patient AI tutor for grades 6 to 12
            that explains what school rushed past, a different way each time, and never moves on until it
            has truly made sense.
          </motion.p>
          <motion.div {...enter(0.45)} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button onClick={() => onAuth("signup")} className="kod-btn w-full px-9 py-4 text-sm sm:w-auto">
              Try Faheem free
            </button>
            <a href="#watch" className="fhm-ghost-night w-full px-9 py-4 text-center text-sm sm:w-auto">
              See a real answer
            </a>
          </motion.div>
          <motion.p {...enter(0.55)} className="mt-5 text-[13px] tracking-wide text-chalk-dim">
            One week free · No card · No auto-renewal
          </motion.p>
        </div>

        {/* Proof figures */}
        <motion.div {...enter(0.7)} className="mx-auto mt-16 max-w-4xl">
          <div className="fhm-hairline" />
          <div className="grid gap-8 py-8 sm:grid-cols-3">
            {PROOF.map((p) => (
              <div key={p.big} className="text-center">
                <p className="kod-display text-2xl text-gold-bright md:text-3xl">{p.big}</p>
                <p className="landing-pretty mx-auto mt-1.5 max-w-[16rem] text-[13px] leading-relaxed text-chalk-dim">{p.small}</p>
              </div>
            ))}
          </div>
          <div className="fhm-hairline" />
        </motion.div>
      </section>

      {/* ---- The three beats ---- */}
      <section aria-label="How Faheem feels to use" className="mx-auto max-w-6xl px-5 pb-20 md:px-8 md:pb-28">
        <div className="grid gap-4 md:grid-cols-3 md:gap-5">
          {BEATS.map((b, i) => (
            <motion.div key={b.title} {...fadeUp(calm, calm ? 0 : i * 0.12)} className="fhm-night-card p-7">
              <span lang="ar" aria-hidden="true" className="fhm-arabic text-2xl leading-none text-gold-bright/80">{b.n}</span>
              <h2 className="kod-display mt-4 text-xl text-chalk">{b.title}</h2>
              <p className="landing-pretty mt-2.5 text-[15px] leading-relaxed text-chalk-dim">{b.body}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
