/**
 * The public landing site: one night, lived in real time.
 *
 * The page opens at 11:04 pm and never leaves the dark. Ivory appears only
 * as bounded sheets of lit paper: the real question, the REAL answer
 * (captured live, unedited, rendered by the product's own components), the
 * real re-explanation, three language index cards, and the pricing page.
 * Night constant, light intermittent: every arrival of light is the product
 * arriving. The finale ticks the night's index and dims the lamp to a
 * bedside dot, because the promise of a catch-net is permission to sleep.
 *
 * All product content on this page is genuine output. No mockups, no
 * fabricated data, no fake proof.
 */
import { useEffect, useRef, useState } from "react";
import Login from "../Login";
import HourAct from "./HourAct";
import AnswerAct from "./AnswerAct";
import LadderSection from "./LadderSection";
import RegisterSection from "./RegisterSection";
import IndexCards from "./IndexCards";
import PricingSheet from "./PricingSheet";
import LampOff, { LandingFooter } from "./LampOff";

export type AuthMode = "login" | "signup";

export default function Landing() {
  const [auth, setAuth] = useState<AuthMode | null>(null);
  const wasAuth = useRef(false);

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

  return (
    <div className="bg-night font-sans text-chalk antialiased">
      <main>
        <HourAct onAuth={setAuth} />
        <AnswerAct />
        <LadderSection />
        <RegisterSection />
        <IndexCards />
        <PricingSheet onAuth={setAuth} />
        <LampOff onAuth={setAuth} />
      </main>
      <LandingFooter onAuth={setAuth} />
    </div>
  );
}
