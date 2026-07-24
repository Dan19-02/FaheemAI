/**
 * Six-box one-time-code input, shared by the password-reset and email-verify
 * screens. Tuned for cheap phones on flaky networks:
 *  - inputMode="numeric" + autoComplete="one-time-code" so iOS/Android/Chrome
 *    offer the code from the email as a one-tap autofill (the single biggest
 *    lever on completion rate),
 *  - paste anywhere fills all boxes,
 *  - backspace steps back, arrows move, non-digits are ignored,
 *  - a labelled group + hidden helper text so screen readers announce it.
 * Calls onComplete once all six digits are present (for auto-submit).
 */
import React, { useRef } from "react";

interface OtpInputProps {
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  /** Accessible name for the group, e.g. "Email verification code". */
  label?: string;
}

const LEN = 6;

export default function OtpInput({ value, onChange, onComplete, disabled, label = "One-time code" }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  // Value is just the accumulated digit string; each box shows one position.
  const digits = Array.from({ length: LEN }, (_, i) => value[i] ?? "");

  const commit = (arr: string[]) => {
    const joined = arr.join("").replace(/\D/g, "").slice(0, LEN);
    onChange(joined);
    if (joined.length === LEN) onComplete?.(joined);
  };

  const handleChange = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, "");
    if (!d) return;
    const arr = [...digits];
    if (d.length > 1) {
      // Autofill ("one-time-code") or a paste-into-box dumps the whole code
      // into a single input — spread the digits across the boxes from here.
      for (let k = 0; k < d.length && i + k < LEN; k++) arr[i + k] = d[k];
      commit(arr);
      refs.current[Math.min(i + d.length, LEN - 1)]?.focus();
    } else {
      arr[i] = d;
      commit(arr);
      if (i < LEN - 1) refs.current[i + 1]?.focus();
    }
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const arr = [...digits];
      if (arr[i]) {
        arr[i] = "";
        commit(arr);
      } else if (i > 0) {
        arr[i - 1] = "";
        commit(arr);
        refs.current[i - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < LEN - 1) {
      refs.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LEN);
    if (pasted) {
      commit(pasted.split(""));
      refs.current[Math.min(pasted.length, LEN - 1)]?.focus();
    }
  };

  return (
    <div role="group" aria-label={label} className="flex justify-between gap-2">
      {Array.from({ length: LEN }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${LEN}`}
          value={digits[i] || ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className="h-12 w-full min-w-0 rounded-xl border border-editorial-line bg-surface text-center text-lg font-semibold text-editorial-charcoal focus:outline-none focus:ring-1 focus:ring-editorial-sage disabled:opacity-50"
        />
      ))}
    </div>
  );
}
