/**
 * The finale and footer, on midnight: the name, said plainly, and one calm
 * ask under the lamp glow. The footer stays a top-level contentinfo
 * landmark via LandingFooter.
 */
import { motion } from "motion/react";
import { useCalm, fadeUp, glowIn } from "./reveals";
import type { AuthMode } from "./Landing";
import { SUPPORT_EMAIL } from "../defaults";
import { FaheemMark } from "./HourAct";

interface LampOffProps {
  onAuth: (mode: AuthMode) => void;
}

export default function LampOff({ onAuth }: LampOffProps) {
  const calm = useCalm();

  return (
    <section className="landing-cv landing-cv-finale fhm-night relative px-5 py-24 text-center md:px-8 md:py-32" aria-label="Start learning">
      <div aria-hidden="true" className="fhm-glow left-1/2 top-10 h-64 w-64 -translate-x-1/2 opacity-50" />
      <div className="relative mx-auto max-w-3xl">
        <motion.p {...fadeUp(calm)} lang="ar" className="fhm-arabic text-[clamp(3rem,9vw,5.5rem)] leading-none text-gold-bright/90">
          فهيم
        </motion.p>
        <motion.h2 {...glowIn(calm, calm ? 0 : 0.1)} className="kod-display landing-balance mt-6 text-[clamp(2rem,5.5vw,3.4rem)] leading-[1.1] text-chalk">
          The one who understands,
          <br />
          until <span className="text-gold-bright">you</span> do.
        </motion.h2>
        <motion.p {...fadeUp(calm, calm ? 0 : 0.2)} className="landing-pretty mx-auto mt-5 max-w-xl text-lg leading-relaxed text-chalk-dim">
          Tomorrow, when a lesson moves faster than it should, let it. You
          have somewhere to bring it now.
        </motion.p>
        <motion.div {...fadeUp(calm, calm ? 0 : 0.3)} className="mt-10 inline-flex flex-col items-center gap-3">
          <button onClick={() => onAuth("signup")} className="kod-btn px-10 py-4 text-sm">
            Try Faheem free
          </button>
          <p className="text-[13px] text-chalk-dim">One week free. No card needed to create an account.</p>
        </motion.div>
      </div>
    </section>
  );
}

export function LandingFooter({ onAuth }: LampOffProps) {
  const link =
    "text-sm text-chalk-dim transition-colors hover:text-gold-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-bright";
  return (
    <footer className="border-t border-night-line bg-slab px-5 py-12 text-chalk md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <FaheemMark size={30} />
          <div>
            <p className="flex items-baseline gap-2">
              <span className="kod-display text-lg tracking-tight text-chalk">Faheem</span>
              <span lang="ar" className="fhm-arabic text-base leading-none text-gold-bright">فهيم</span>
            </p>
            <p className="text-[13px] text-chalk-dim">The AI tutor built for Gulf classrooms.</p>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-6" aria-label="Footer">
          <a href="#watch" className={link}>A real answer</a>
          <a href="#features" className={link}>What Faheem does</a>
          <a href="#why" className={link}>Why Faheem</a>
          <a href="#parents" className={link}>For parents</a>
          <a href="#pricing" className={link}>Pricing</a>
          <a href={`mailto:${SUPPORT_EMAIL}`} className={link}>Support</a>
          <button onClick={() => onAuth("login")} className={link}>
            Sign in
          </button>
        </nav>
      </div>
      <p className="mx-auto mt-9 max-w-6xl text-[12px] text-chalk-dim">
        &copy; 2026 Faheem AI &middot; Questions, payments, anything at all:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-chalk underline underline-offset-2 transition-colors hover:text-gold-bright">
          {SUPPORT_EMAIL}
        </a>
        , the only address we answer from.
      </p>
    </footer>
  );
}
