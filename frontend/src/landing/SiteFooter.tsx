/**
 * The landing footer: a deepest deep-sea band closing the page. Wordmark with
 * a tagline, Arabic nav, and the single support address. A top-level
 * contentinfo landmark, sitting outside <main>.
 */
import Wordmark from "./Wordmark";
import type { AuthMode } from "./Landing";
import { SUPPORT_EMAIL } from "../defaults";

interface SiteFooterProps {
  onAuth: (mode: AuthMode) => void;
}

export default function SiteFooter({ onAuth }: SiteFooterProps) {
  const link =
    "text-sm text-[var(--color-chalk-dim)] transition-colors hover:text-[var(--color-chalk)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-red)]";

  return (
    <footer className="border-t border-[var(--color-night-line)] bg-[var(--color-night-deep)] px-6 py-12 text-[var(--color-chalk)] md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 md:flex-row md:items-center">
        <Wordmark size={36} tone="chalk" tagline="معلّمٌ صبور لكلّ طالبٍ في البحرين." />

        <nav className="flex flex-wrap items-center gap-6" aria-label="روابط التذييل">
          <a href="#proof" className={link}>
            شاهده يشرح
          </a>
          <a href="#reach" className={link}>
            لِمن هو
          </a>
          <a href={`mailto:${SUPPORT_EMAIL}`} className={link}>
            الدعم
          </a>
          <button onClick={() => onAuth("login")} className={link}>
            تسجيل الدخول
          </button>
        </nav>
      </div>

      <p className="mx-auto mt-8 max-w-6xl text-[12px] leading-relaxed text-[var(--color-chalk-dim)]">
        © 2026 فهيم <span aria-hidden="true">·</span> فهيم منتَجٌ من{" "}
        <span className="fh-latin font-semibold text-[var(--color-chalk)]">Clarify.AI</span>{" "}
        <span aria-hidden="true">·</span> لأيّ سؤال أو استفسار، راسلنا على{" "}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="fh-latin text-[var(--color-chalk-dim)] underline underline-offset-2 transition-colors hover:text-[var(--color-chalk)]"
        >
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
    </footer>
  );
}
