/**
 * The landing header: a warm pearl bar, sticky, RTL. The wordmark sits at the
 * start (right), the nav and calm sign-in / start-free actions at the end.
 * Nav labels are Arabic; the anchors point to the proof and reach sections.
 */
import Wordmark from "./Wordmark";
import type { AuthMode } from "./Landing";

interface SiteHeaderProps {
  onAuth: (mode: AuthMode) => void;
}

export default function SiteHeader({ onAuth }: SiteHeaderProps) {
  const navLink =
    "hidden text-[15px] text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-red)] md:block";

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-line-soft)] bg-[var(--color-pearl)]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3.5 md:px-8">
        <a
          href="#top"
          className="rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-red)]"
          aria-label="فهيم — الصفحة الرئيسية"
        >
          <Wordmark size={34} />
        </a>

        <nav className="flex items-center gap-2 md:gap-6" aria-label="التنقّل الرئيسي">
          <a href="#proof" className={navLink}>
            شاهده يشرح
          </a>
          <a href="#reach" className={navLink}>
            لِمن هو
          </a>
          <button
            onClick={() => onAuth("login")}
            className="rounded-full border border-[var(--color-line)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-sand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-red)]"
          >
            تسجيل الدخول
          </button>
          <button
            onClick={() => onAuth("signup")}
            className="faheem-btn hidden text-sm sm:inline-flex sm:items-center"
          >
            ابدأ مجانًا
          </button>
        </nav>
      </div>
    </header>
  );
}
