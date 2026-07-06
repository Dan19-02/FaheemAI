/**
 * The half-caught classroom phrases of the night. One of them, the story's
 * protagonist phrase, drifts through the hero; seven return in the finale's
 * index page, ticked. A sparse handful rest behind the filmstrip. Real
 * syllabus terms a student actually hears fly past in an Indian classroom.
 */
export interface DriftWord {
  text: string;
  /** Animation shape (CSS vars consumed by .landing-drift). */
  dur: string;
  delay: string;
  dx: string;
  dy: string;
  rot: string;
}

/**
 * Static words resting in the dark behind the filmstrip vignettes. Chalk on
 * night, kept sparse (the act's air is the point), never overlapping the
 * reading column. Formulas use ASCII math only (no em/en dashes, per the
 * app-wide rule).
 */
export interface ScatterWord {
  text: string;
  top: string;
  left: string;
  size: string;
  opacity: number;
  rot: string;
  /** Only shown from this breakpoint up, so phones stay quiet. */
  show?: "lg" | "2xl";
}

export const NIGHT_SCATTER: ScatterWord[] = [
  { text: "F = dp/dt", top: "6%", left: "72%", size: "1.5rem", opacity: 0.18, rot: "-2deg" },
  { text: "sin²θ + cos²θ = 1", top: "27%", left: "8%", size: "1.3rem", opacity: 0.16, rot: "1.5deg", show: "lg" },
  { text: "∫ sec²x dx", top: "48%", left: "84%", size: "1.4rem", opacity: 0.17, rot: "-1.5deg", show: "lg" },
  { text: "mitochondria", top: "66%", left: "7%", size: "1.1rem", opacity: 0.15, rot: "1deg", show: "lg" },
  { text: "b² - 4ac", top: "88%", left: "76%", size: "1.4rem", opacity: 0.17, rot: "1deg" },
];

/**
 * The protagonist phrase is index 0: it drifts alone through the hero, is
 * pinned to paper by the real answer, and is ticked off in the finale. The
 * first seven entries become the finale's index rows.
 */
export const DRIFT_WORDS: DriftWord[] = [
  { text: "rate of change of momentum", dur: "19s", delay: "0s", dx: "18px", dy: "-14px", rot: "-2deg" },
  { text: "sin²θ + cos²θ = 1", dur: "23s", delay: "-6s", dx: "-16px", dy: "12px", rot: "1.5deg" },
  { text: "electronegativity", dur: "21s", delay: "-11s", dx: "-20px", dy: "-10px", rot: "-1deg" },
  { text: "Le Chatelier's principle", dur: "24s", delay: "-3s", dx: "14px", dy: "10px", rot: "2deg" },
  { text: "mitochondria", dur: "26s", delay: "-9s", dx: "-12px", dy: "16px", rot: "0deg" },
  { text: "projectile motion", dur: "22s", delay: "-14s", dx: "16px", dy: "-12px", rot: "1deg" },
  { text: "∫ sec²x dx", dur: "20s", delay: "-7s", dx: "-14px", dy: "-16px", rot: "-1.5deg" },
];
