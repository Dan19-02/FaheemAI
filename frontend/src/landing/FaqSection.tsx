/**
 * FAQ — the honest questions a student (or their parent) actually asks, as a
 * calm native <details> accordion (keyboard-accessible, no JS, direction-aware).
 * Answers restate real facts from the rest of the page — free trial, boards,
 * accuracy, bilingual, subjects, and the "not a replacement for your teacher"
 * honesty. Soft sand surface before the final CTA.
 */
import { ChevronDown } from "lucide-react";
import { useLandingCopy } from "./copy";

export default function FaqSection() {
  const { c } = useLandingCopy();

  return (
    <section
      id="faq"
      className="fh-cv relative bg-[var(--color-sand)] px-5 py-20 md:px-8 md:py-28"
      aria-label={c.faq.ariaLabel}
    >
      <div className="relative z-10 mx-auto max-w-3xl">
        <p className="text-sm font-bold tracking-wide text-[var(--color-sea)]">{c.faq.kicker}</p>
        <h2 className="fh-display mt-3 text-[clamp(2rem,5vw,3.2rem)] text-[var(--color-ink)]">
          {c.faq.title}
        </h2>

        <div className="mt-10 flex flex-col gap-3">
          {c.faq.items.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-[var(--color-line)] bg-[var(--color-pearl)] px-5 py-4 md:px-6 md:py-5 [&[open]]:border-[var(--color-sea)]/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-red)]">
                <span className="fh-display text-lg text-[var(--color-ink)] md:text-xl">{item.q}</span>
                <ChevronDown
                  size={20}
                  aria-hidden="true"
                  className="shrink-0 text-[var(--color-sea)] transition-transform duration-300 group-open:rotate-180"
                />
              </summary>
              <p className="fh-pretty mt-3 text-[15px] leading-relaxed text-[var(--color-ink-soft)] md:text-base">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
