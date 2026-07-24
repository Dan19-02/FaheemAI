/**
 * Faheem's motion vocabulary: slow, luminous, composed. Everything is
 * opacity + transform (plus one soft blur sharpen), tuned to the calm-trust
 * register: decelerating ease, ~0.7s reveals, no springs, no bounce.
 *
 * Reduced-motion visitors and hidden-at-mount renders (useStaticStart) get
 * every element at its final state: the page must read perfectly still.
 */
import { useReducedMotion } from "motion/react";
import { useStaticStart } from "./useStaticStart";

export const EASE = [0.16, 1, 0.3, 1] as const;

/** True when the page should skip all entrance choreography. */
export function useCalm(): boolean {
  const prefersReduced = useReducedMotion();
  const staticStart = useStaticStart();
  // Ancient WebViews without IntersectionObserver could never fire
  // whileInView, leaving reveal targets at opacity 0 forever: collapse every
  // reveal to its final state there instead.
  const noObserver = typeof IntersectionObserver === "undefined";
  return Boolean(prefersReduced) || staticStart || noObserver;
}

/** Paragraphs and blocks: a quiet, unhurried rise. */
export function fadeUp(calm: boolean, delay = 0) {
  return calm
    ? {}
    : {
        initial: { opacity: 0, y: 22 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-10% 0px" },
        transition: { duration: 0.75, delay, ease: EASE },
      };
}

/** Paper and framed media: settles into place with the faintest scale. */
export function sheetRise(calm: boolean, delay = 0) {
  return calm
    ? {}
    : {
        initial: { opacity: 0, y: 18, scale: 0.988 },
        whileInView: { opacity: 1, y: 0, scale: 1 },
        viewport: { once: true, margin: "-8% 0px" },
        transition: { duration: 0.8, delay, ease: EASE },
      };
}

/** Display lines: arrive from a soft out-of-focus glow and sharpen. */
export function glowIn(calm: boolean, delay = 0) {
  return calm
    ? {}
    : {
        initial: { opacity: 0, filter: "blur(6px)", y: 10 },
        whileInView: { opacity: 1, filter: "blur(0px)", y: 0 },
        viewport: { once: true, margin: "-10% 0px" },
        transition: { duration: 0.9, delay, ease: EASE },
      };
}
