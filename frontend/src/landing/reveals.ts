/**
 * The landing page's entire motion vocabulary: four reveal treatments,
 * rotated across the acts so no single one repeats often enough to become
 * wallpaper. Everything is transform and opacity, except the four short
 * timestamps which sharpen from a small blur.
 *
 * Reduced-motion visitors and hidden-at-mount renders (useStaticStart) get
 * every element at its final state: the story must read as a static comic.
 */
import { useReducedMotion } from "motion/react";
import { useStaticStart } from "./useStaticStart";

export const EASE = [0.22, 1, 0.36, 1] as const;

/** True when the page should skip all entrance choreography. */
export function useCalm(): boolean {
  const prefersReduced = useReducedMotion();
  const staticStart = useStaticStart();
  return Boolean(prefersReduced) || staticStart;
}

/** Paragraphs and small blocks: a plain, quiet rise. */
export function fadeUp(calm: boolean, delay = 0) {
  return calm
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-12% 0px" },
        transition: { duration: 0.7, delay, ease: EASE },
      };
}

/** Lit paper: the sheet settles into place while its glow blooms with it. */
export function sheetRise(calm: boolean) {
  return calm
    ? {}
    : {
        initial: { opacity: 0, y: 12, scale: 0.985 },
        whileInView: { opacity: 1, y: 0, scale: 1 },
        viewport: { once: true, margin: "-8% 0px" },
        transition: { duration: 0.6, ease: EASE },
      };
}

/** The clock spine: a timestamp arrives out of focus and sharpens. */
export function stamp(calm: boolean) {
  return calm
    ? {}
    : {
        initial: { opacity: 0, filter: "blur(4px)" },
        whileInView: { opacity: 1, filter: "blur(0px)" },
        viewport: { once: true, margin: "-15% 0px" },
        transition: { duration: 0.8, ease: "easeOut" as const },
      };
}

/** Ledger hairlines draw themselves in from the left. */
export function drawX(calm: boolean) {
  return calm
    ? {}
    : {
        initial: { scaleX: 0 },
        whileInView: { scaleX: 1 },
        viewport: { once: true, margin: "-10% 0px" },
        transition: { duration: 0.5, ease: "easeOut" as const },
      };
}
