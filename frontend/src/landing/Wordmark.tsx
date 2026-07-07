/**
 * The Faheem wordmark: the ف mark in a Bahrain-red pearl token, with the
 * Arabic wordmark فهيم beside it. Bespoke and unmistakably Arabic — no Latin
 * serif italics. Sized by prop so the header and footer share one component.
 */
interface WordmarkProps {
  /** Size of the round ف token, px. Wordmark text scales with it. */
  size?: number;
  /** Tone for the wordmark text: dark on pearl, or chalk on night. */
  tone?: "ink" | "chalk";
  tagline?: string;
}

export default function Wordmark({ size = 34, tone = "ink", tagline }: WordmarkProps) {
  const textColor = tone === "chalk" ? "var(--color-chalk)" : "var(--color-ink)";
  const dimColor = tone === "chalk" ? "var(--color-chalk-dim)" : "var(--color-ink-soft)";

  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="faheem-mark shrink-0"
        aria-hidden="true"
        style={{ width: size, height: size, fontSize: size * 0.56 }}
      >
        ف
      </span>
      <span className="flex flex-col leading-none">
        <span
          className="fh-display font-extrabold tracking-tight"
          style={{ color: textColor, fontSize: size * 0.62 }}
        >
          فهيم
        </span>
        {tagline && (
          <span className="mt-1 text-[12px] font-medium" style={{ color: dimColor }}>
            {tagline}
          </span>
        )}
      </span>
    </span>
  );
}
