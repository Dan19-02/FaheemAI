/**
 * The landing footer: a deepest deep-sea band closing the page. Wordmark with a
 * tagline, nav, and the single support address. A top-level contentinfo
 * landmark, sitting outside <main>. Follows the active landing language.
 */
import Wordmark from "./Wordmark";
import type { AuthMode } from "./Landing";
import { SUPPORT_EMAIL } from "../defaults";
import { useLandingCopy } from "./copy";

interface SiteFooterProps {
  onAuth: (mode: AuthMode) => void;
}

export default function SiteFooter({ onAuth }: SiteFooterProps) {
  const { c } = useLandingCopy();
  const link =
    "text-sm text-[var(--color-chalk-dim)] transition-colors hover:text-[var(--color-chalk)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-red)]";

  return (
    <footer className="border-t border-[var(--color-night-line)] bg-[var(--color-night-deep)] px-6 py-12 text-[var(--color-chalk)] md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 md:flex-row md:items-center">
        <Wordmark size={36} tone="chalk" tagline={c.footer.tagline} />

        <nav className="flex flex-wrap items-center gap-6" aria-label={c.footer.navAria}>
          <a href="#proof" className={link}>
            {c.footer.proof}
          </a>
          <a href="#reach" className={link}>
            {c.footer.reach}
          </a>
          <a href={`mailto:${SUPPORT_EMAIL}`} className={link}>
            {c.footer.support}
          </a>
          <button onClick={() => onAuth("login")} className={link}>
            {c.footer.login}
          </button>
        </nav>
      </div>

      <p className="mx-auto mt-8 max-w-6xl text-[12px] leading-relaxed text-[var(--color-chalk-dim)]">
        {c.footer.copyrightLead}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          dir="ltr"
          className="fh-latin text-[var(--color-chalk-dim)] underline underline-offset-2 transition-colors hover:text-[var(--color-chalk)]"
        >
          {SUPPORT_EMAIL}
        </a>
        {c.footer.copyrightTail}
      </p>
    </footer>
  );
}
