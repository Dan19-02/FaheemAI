/**
 * Renders an Arabic term paired with its English technical term, e.g.
 *   التسارع (acceleration)
 *
 * The Latin technical term is wrapped in a bidi-isolated LTR span so the
 * parentheses and the English word keep their natural left-to-right order even
 * when they sit inside a right-to-left paragraph. Without the isolate, the RTL
 * bidi algorithm would flip the brackets to ")acceleration(".
 */
import React from "react";

interface BilingualTermProps {
  /** The Arabic term (rendered in the surrounding paragraph's direction). */
  ar: string;
  /** The English technical term shown, LTR-isolated, in parentheses. */
  en: string;
  className?: string;
}

export function BilingualTerm({ ar, en, className }: BilingualTermProps) {
  return (
    <span className={className}>
      {ar}{" "}
      <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
        ({en})
      </span>
    </span>
  );
}

export default BilingualTerm;
