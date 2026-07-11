/**
 * AUDIENCE — who Faheem is for: the student first, the parent second.
 *
 * A calm two-column split. The student column is the product; the parent column
 * is the reassurance (free, honest, curriculum-bound). No invented personas —
 * both columns restate promises the rest of the page already keeps.
 */
import { motion } from "motion/react";
import { GraduationCap, HeartHandshake, Check } from "lucide-react";
import { useCalm, fadeUp, sheetRise } from "./reveals";
import { useLandingCopy } from "./copy";

const GROUP_ICONS = [GraduationCap, HeartHandshake];

export default function AudienceSection() {
  const calm = useCalm();
  const { c } = useLandingCopy();

  return (
    <section
      id="audience"
      className="fh-cv relative bg-[var(--color-sand)] px-5 py-20 md:px-8 md:py-28"
      aria-label={c.audience.ariaLabel}
    >
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <motion.p {...fadeUp(calm)} className="text-sm font-bold tracking-wide text-[var(--color-sea)]">
            {c.audience.kicker}
          </motion.p>
          <motion.h2
            {...fadeUp(calm, calm ? 0 : 0.05)}
            className="fh-display mt-3 text-[clamp(2rem,5vw,3.2rem)] text-[var(--color-ink)]"
          >
            {c.audience.title}
          </motion.h2>
          <motion.p
            {...fadeUp(calm, calm ? 0 : 0.1)}
            className="fh-pretty mt-5 text-[15px] leading-relaxed text-[var(--color-ink-soft)] md:text-base"
          >
            {c.audience.subtitle}
          </motion.p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 md:gap-6">
          {c.audience.groups.map((group, i) => {
            const Icon = GROUP_ICONS[i] ?? GraduationCap;
            return (
              <motion.div
                key={group.title}
                {...sheetRise(calm, calm ? 0 : i * 0.08)}
                className="faheem-card bg-[var(--color-pearl)] p-7 md:p-9"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-sea-soft)] text-[var(--color-sea)]">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <h3 className="fh-display text-xl text-[var(--color-ink)] md:text-2xl">{group.title}</h3>
                </div>
                <ul className="mt-6 flex flex-col gap-3.5">
                  {group.points.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <Check size={18} className="mt-0.5 shrink-0 text-[var(--color-sea)]" aria-hidden="true" />
                      <span className="fh-pretty text-[15px] leading-relaxed text-[var(--color-ink-soft)] md:text-base">
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
