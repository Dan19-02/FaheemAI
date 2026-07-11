/**
 * The landing header: a warm pearl bar, sticky. The wordmark sits at the start,
 * the nav, the language toggle, and the calm sign-in / start-free actions at
 * the end. Nav labels and the toggle follow the active landing language.
 */
import Wordmark from "./Wordmark";
import type { AuthMode } from "./Landing";
import { useLandingCopy } from "./copy";
import { useLocale } from "../i18n/LocaleContext";

interface SiteHeaderProps {
  onAuth: (mode: AuthMode) => void;
}

/** A compact ع | EN pill that flips the whole landing (and app) language. */
function LangToggle() {
  const { lang, setLang } = useLocale();
  const { c } = useLandingCopy();
  const seg =
    "rounded-full px-3 py-1 text-[13px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-red)]";
  return (
    <div
      className="flex items-center rounded-full border border-[var(--color-line)] bg-[var(--color-pearl)] p-0.5"
      role="group"
      aria-label={lang === "ar" ? c.header.switchToEnglish : c.header.switchToArabic}
    >
      <button
        type="button"
        onClick={() => setLang("ar")}
        aria-pressed={lang === "ar"}
        className={`${seg} ${lang === "ar" ? "bg-[var(--color-red)] text-white" : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"}`}
      >
        ع
      </button>
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        className={`fh-latin ${seg} ${lang === "en" ? "bg-[var(--color-red)] text-white" : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"}`}
      >
        EN
      </button>
    </div>
  );
}

export default function SiteHeader({ onAuth }: SiteHeaderProps) {
  const { c } = useLandingCopy();
  const navLink =
    "hidden text-[15px] text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-red)] md:block";

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-line-soft)] bg-[var(--color-pearl)]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3.5 md:px-8">
        <a
          href="#top"
          className="rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-red)]"
          aria-label={c.header.homeAria}
        >
          <Wordmark size={34} />
        </a>

        <nav className="flex items-center gap-2 md:gap-5" aria-label={c.header.navAria}>
          <a href="#proof" className={navLink}>
            {c.header.proof}
          </a>
          <a href="#reach" className={navLink}>
            {c.header.reach}
          </a>
          <LangToggle />
          <button
            onClick={() => onAuth("login")}
            className="rounded-full border border-[var(--color-line)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-sand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-red)]"
          >
            {c.header.login}
          </button>
          <button
            onClick={() => onAuth("signup")}
            className="faheem-btn hidden text-sm sm:inline-flex sm:items-center"
          >
            {c.header.startFree}
          </button>
        </nav>
      </div>
    </header>
  );
}
