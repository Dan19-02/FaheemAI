/**
 * The mastery moment, on screen: one calm, warm celebration card that pops in,
 * sparkles once (about 1.5 seconds of motion), lingers just long enough to be
 * read, and leaves. Tap anywhere on it to dismiss early.
 *
 * It renders ONLY what the celebrations module allowed through (examiner-
 * verified transitions and real milestones), so this component has no honesty
 * logic of its own: it is purely the light show.
 */
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Celebration } from "./celebrations";

const HOLD_MS = 4200;

// Eight sparkle offsets (deterministic, so renders are stable).
const SPARKS: { x: number; y: number; d: number }[] = [
  { x: -66, y: -44, d: 0 },
  { x: 58, y: -52, d: 60 },
  { x: -84, y: 8, d: 120 },
  { x: 88, y: -6, d: 40 },
  { x: -40, y: -70, d: 200 },
  { x: 36, y: -76, d: 160 },
  { x: -14, y: -88, d: 90 },
  { x: 14, y: -84, d: 240 },
];

export function CelebrationOverlay({ celebration, onDone }: { celebration: Celebration | null; onDone: () => void }) {
  // onDone lives in a ref so the auto-dismiss timer depends ONLY on which
  // celebration is showing. Passing onDone in the deps would restart the timer
  // on every parent re-render (which happens on each answer), so the card could
  // linger forever and queued celebrations would never advance.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(() => onDoneRef.current(), HOLD_MS);
    return () => clearTimeout(t);
  }, [celebration]);

  const landedTone = celebration?.tone === "landed";

  return (
    <AnimatePresence>
      {celebration && (
        <motion.div
          key={`${celebration.tone}:${celebration.title}`}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -10, x: "-50%", scale: 0.92 }}
          animate={{ opacity: 1, y: 0, x: "-50%", scale: 1 }}
          exit={{ opacity: 0, y: -8, x: "-50%", scale: 0.97 }}
          transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={onDone}
          className={`fixed left-1/2 top-16 z-[65] max-w-[92vw] sm:max-w-md cursor-pointer select-none rounded-2xl border px-5 py-3.5 text-center shadow-lg ${
            landedTone
              ? "bg-editorial-sage text-white border-editorial-sage"
              : "bg-surface text-editorial-charcoal border-editorial-sage/40"
          }`}
        >
          {/* The 1.5s sparkle burst, pure CSS, skipped under reduced motion. */}
          <span aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
            {SPARKS.map((s, i) => (
              <span
                key={i}
                className="cfy-sparkle motion-reduce:hidden"
                style={{
                  left: "50%",
                  top: "50%",
                  ["--sx" as any]: `${s.x}px`,
                  ["--sy" as any]: `${s.y}px`,
                  animationDelay: `${s.d}ms`,
                }}
              />
            ))}
          </span>
          <p className="kod-display text-base leading-snug">{celebration.title}</p>
          {celebration.sub && (
            <p className={`mt-1 text-xs ${landedTone ? "text-white/85" : "text-editorial-charcoal/70"}`}>{celebration.sub}</p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
