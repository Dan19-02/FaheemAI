/**
 * Faheem — the marketing landing. Bespoke, Arabic-first (RTL), "Pearl & Ink".
 *
 * This is Faheem's OWN story, not a translated foreign app and not the forked
 * app's night-classroom narrative. Its spine is one open loop, opened in the
 * hero and paid off across the page:
 *
 *   HERO      — the promise: a patient teacher, in YOUR language, that gets
 *               YOUR exact Bahrain curriculum right. A claim that pulls you
 *               down to see how it is true.
 *   PROOF     — the payoff of the accuracy promise: a real, grounded answer
 *               in Arabic, carrying the sea-teal "from your unit" curriculum
 *               source chip. Accuracy is the product, so this is the hero beat.
 *   REEXPLAIN — the teaching style: one tap, and it explains again a different
 *               way, until it lands.
 *   REACH     — who it is for: boards (Bahrain MoE · CBSE · Cambridge), grades
 *               9-12, both languages, the ways in.
 *   CTA       — a calm ask: start free during the Bahrain pilot. No pricing.
 *
 * The whole surface is dir="rtl": Arabic reads first, English appears only as
 * LTR-isolated technical terms. All product content on this page is genuine
 * output (see realAnswer.ts) — no mockups, no fabricated proof.
 */
import { useEffect, useRef, useState } from "react";
import Login from "../Login";
import { useLocale } from "../i18n/LocaleContext";
import "./landing.css";
import SiteHeader from "./SiteHeader";
import HeroSection from "./HeroSection";
import ProofSection from "./ProofSection";
import ReexplainSection from "./ReexplainSection";
import ReachSection from "./ReachSection";
import CtaSection from "./CtaSection";
import SiteFooter from "./SiteFooter";

export type AuthMode = "login" | "signup";

export default function Landing() {
  const [auth, setAuth] = useState<AuthMode | null>(null);
  const wasAuth = useRef(false);
  const { dir, lang } = useLocale();

  // Swapping to the auth screen scrolls to its top; coming back restores
  // keyboard/screen-reader context by focusing the page title.
  useEffect(() => {
    if (auth) {
      wasAuth.current = true;
      window.scrollTo(0, 0);
    } else if (wasAuth.current) {
      wasAuth.current = false;
      document.getElementById("hero-title")?.focus({ preventScroll: true });
    }
  }, [auth]);

  if (auth) {
    return <Login initialMode={auth} onBack={() => setAuth(null)} />;
  }

  // The landing follows the app-wide locale: Arabic-first (RTL) by default, and
  // the header toggle flips the whole page to English (LTR). The two REAL
  // captured answer cards stay Arabic (pinned locally) — see copy.ts.
  return (
    <div dir={dir} lang={lang} className="fh-landing bg-[var(--color-pearl)] text-[var(--color-ink)]">
      <SiteHeader onAuth={setAuth} />
      <main>
        <HeroSection onAuth={setAuth} />
        <ProofSection />
        <ReexplainSection />
        <ReachSection />
        <CtaSection onAuth={setAuth} />
      </main>
      <SiteFooter onAuth={setAuth} />
    </div>
  );
}
