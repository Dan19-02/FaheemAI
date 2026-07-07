/**
 * The landing page's motion vocabulary. Middle-leaning-energy: crisp
 * --ease-out reveals on scroll, a light --ease-spring on interactive/proof
 * accents, calm at the proof moment. Everything is transform + opacity.
 *
 * Reduced-motion visitors and hidden-at-mount renders (useStaticStart) get
 * every element at its final state: the story must read as a static page.
 */
import { useReducedMotion } from "motion/react";
import { useStaticStart } from "./useStaticStart";

/** Confident arrival — mirrors --ease-out in index.css. */
export const EASE = [0.22, 1, 0.36, 1] as const;
/** Light life on micro-moments — mirrors --ease-spring. */
export const SPRING = [0.34, 1.4, 0.64, 1] as const;

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
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.2 },
        transition: { duration: 0.6, delay, ease: EASE },
      };
}

/** A proof surface (the answer sheet / cards) settling into place. */
export function sheetRise(calm: boolean, delay = 0) {
  return calm
    ? {}
    : {
        initial: { opacity: 0, y: 20, scale: 0.985 },
        whileInView: { opacity: 1, y: 0, scale: 1 },
        viewport: { once: true, amount: 0.15 },
        transition: { duration: 0.6, delay, ease: EASE },
      };
}

/**
 * A chat bubble arriving from its own side. In RTL the tutor sits at the
 * start (right) and the student replies from the end (left); pass the sign so
 * each bubble slides in from its own edge along the *inline* axis.
 */
export function bubbleIn(calm: boolean, fromX = 18, delay = 0) {
  return calm
    ? {}
    : {
        initial: { opacity: 0, x: fromX, y: 8 },
        whileInView: { opacity: 1, x: 0, y: 0 },
        viewport: { once: true, amount: 0.2 },
        transition: { duration: 0.6, delay, ease: EASE },
      };
}

/**
 * A light spring for interactive / accent beats (the source chip landing, a
 * number popping). Calm at proof moments means we use this sparingly.
 */
export function springIn(calm: boolean, delay = 0) {
  return calm
    ? {}
    : {
        initial: { opacity: 0, scale: 0.9 },
        whileInView: { opacity: 1, scale: 1 },
        viewport: { once: true, amount: 0.2 },
        transition: { duration: 0.5, delay, ease: SPRING },
      };
}

/**
 * A hairline that draws itself in along the inline axis. RTL-aware: pass
 * rtl=true so the origin is the leading (right) edge and it grows toward the
 * end, matching how the eye scans an Arabic line.
 */
export function drawX(calm: boolean, rtl = true) {
  return calm
    ? {
        style: { transformOrigin: rtl ? "right" : "left" } as const,
      }
    : {
        initial: { scaleX: 0 },
        whileInView: { scaleX: 1 },
        viewport: { once: true, amount: 0.2 },
        transition: { duration: 0.55, ease: "easeOut" as const },
        style: { transformOrigin: rtl ? "right" : "left" } as const,
      };
}
