/**
 * Static chalk words resting in the dark behind the filmstrip, in the same
 * spirit as the hero: no movement, just calm phrases in the empty space,
 * placed to never overlap the reading content. Decorative only: aria-hidden,
 * non-interactive, behind content (z-0; content sits at z-10).
 */
import { NIGHT_SCATTER, type ScatterWord } from "./words";

const SHOW_CLASS: Record<NonNullable<ScatterWord["show"]>, string> = {
  lg: "hidden lg:block",
  "2xl": "hidden 2xl:block",
};

export default function ScatterWords({ words = NIGHT_SCATTER }: { words?: ScatterWord[] }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden">
      {words.map((w, i) => (
        <span
          key={i}
          className={`absolute whitespace-nowrap font-serif italic text-chalk ${w.show ? SHOW_CLASS[w.show] : ""}`}
          style={{
            top: w.top,
            left: w.left,
            fontSize: w.size,
            opacity: w.opacity,
            transform: `rotate(${w.rot})`,
          }}
        >
          {w.text}
        </span>
      ))}
    </div>
  );
}
