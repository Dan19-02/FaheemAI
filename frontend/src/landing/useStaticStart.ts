import { useState } from "react";

/**
 * True when the page mounted while the document was hidden (headless
 * renderer, prerenderer, background tab). requestAnimationFrame is throttled
 * to zero there, so JS-driven entrance animations would never play and
 * initial-opacity-0 content would ship invisible. In that case the landing
 * skips entrance choreography and renders everything at its final, visible
 * state. Real, visible visitors get the full motion.
 */
export function useStaticStart(): boolean {
  const [staticStart] = useState(
    () => typeof document !== "undefined" && document.visibilityState === "hidden"
  );
  return staticStart;
}
