/**
 * The Landing Signal, made visible: an HONEST per-concept understanding read.
 * It shows only what was measured, and it never claims "you understood this"
 * unless the backend confirmed it with a graded transfer check. Three states:
 *   landed     = a spaced-confirmed transfer pass (the real "you've got this")
 *   practiced  = one graded pass, not yet re-confirmed on a later day
 *   working_on_it = still being worked on (incl. any measured struggle)
 * Silent-first: the panel simply hides until there is something measured.
 *
 * Also renders, from the same fetch:
 * - "Today": the session memory summary (what landed today, what is still
 *   fuzzy), straight from the honest event log; hidden on a quiet day.
 * - "Journey": the confusion timeline, concepts grouped by the month they
 *   were first measured, so a student can see how far they have come.
 *
 * Presentational only: the workspace owns the fetch (it also diffs states to
 * fire mastery celebrations), passes the data down, and names freshly-promoted
 * concepts in glowKeys so their chips glow as they slide up the list.
 */
import { useState } from "react";
import { CircleCheck, CircleDot, Sparkles, Route } from "lucide-react";
import { motion } from "motion/react";

export interface CompConcept {
  key: string;
  label: string;
  chapter: string | null;
  state: "landed" | "practiced" | "working_on_it";
  struggles: number;
  passes: number;
  firstSeen?: string | null;
  lastPass?: string | null;
}

export interface CompSummary {
  landed: number;
  practiced: number;
  working: number;
}

export interface CompToday {
  learned: { key: string; label: string }[];
  fuzzy: { key: string; label: string }[];
  touched: number;
}

// "Passed a check" is deliberate: a first pass only reaches practiced, so the
// summary may not say "locked in" (that is reserved for landed).
function todayCopy() {
  return { title: "Today", landed: "Passed a check today", fuzzy: "Still a little fuzzy", plan: "Five quiet minutes tomorrow will settle it." };
}

/** Days between two timestamps, floored at 1 (a same-day landing reads as "1 day"). */
function daysBetween(a: string, b: string): number {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5));
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function UnderstandingPanel({
  enabled,
  concepts,
  summary,
  glowKeys,
  today,
}: {
  enabled: boolean;
  concepts: CompConcept[];
  summary: CompSummary;
  glowKeys: string[];
  today?: CompToday;
}) {
  const [open, setOpen] = useState(true);
  const [journeyOpen, setJourneyOpen] = useState(false);
  // Silent-first: nothing measured yet, or feature off -> render nothing.
  if (!enabled || concepts.length === 0) return null;

  // Landed and practiced first (the wins), then what is still being worked on.
  const order = { landed: 0, practiced: 1, working_on_it: 2 } as const;
  const sorted = [...concepts].sort((a, b) => order[a.state] - order[b.state]);
  const tc = todayCopy();

  // Journey: months (oldest first) -> the concepts first measured that month.
  const journey = new Map<string, CompConcept[]>();
  for (const c of [...concepts].sort((a, b) => (a.firstSeen || "").localeCompare(b.firstSeen || ""))) {
    if (!c.firstSeen) continue;
    const m = monthLabel(c.firstSeen);
    journey.set(m, [...(journey.get(m) || []), c]);
  }

  const chip = (c: CompConcept) => {
    if (c.state === "landed")
      return { icon: CircleCheck, cls: "border-editorial-sage/40 bg-editorial-sage/10 text-editorial-sage" };
    if (c.state === "practiced")
      return { icon: CircleDot, cls: "border-editorial-line bg-editorial-stone text-editorial-charcoal/80" };
    return { icon: Sparkles, cls: "border-editorial-line-light bg-transparent text-editorial-charcoal/60" };
  };

  return (
    <div className="flex flex-col gap-2 border-t border-editorial-line pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        title="What has landed for you, measured from your own answers"
        className="flex items-center justify-between px-1 cursor-pointer text-editorial-sage"
      >
        <span className="kod-display text-sm">What's landing</span>
        <span className="text-[10px] text-editorial-charcoal/60">
          {summary.landed + summary.practiced}/{concepts.length}
        </span>
      </button>

      {open && (
        <>
          {today && today.touched > 0 && (today.learned.length > 0 || today.fuzzy.length > 0) && (
            <div className="mx-1 rounded-xl border border-editorial-line-light bg-editorial-stone/40 px-3 py-2">
              <p className="kod-display text-[11px] text-editorial-charcoal/70">{tc.title}</p>
              {today.learned.length > 0 && (
                <p className="mt-1 text-[11px] leading-snug text-editorial-sage">
                  {tc.landed}: {today.learned.map((l) => l.label).join(", ")}
                </p>
              )}
              {today.fuzzy.length > 0 && (
                <p className="mt-1 text-[11px] leading-snug text-editorial-charcoal/60">
                  {tc.fuzzy}: {today.fuzzy.map((f) => f.label).join(", ")}. {tc.plan}
                </p>
              )}
            </div>
          )}
          <p className="px-1 text-[11px] leading-snug text-editorial-charcoal/55">
            Measured from your own answers, never guessed. A concept only shows as landed once you have
            answered a fresh check on it correctly.
          </p>
          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
            {sorted.map((c) => {
              const { icon: Icon, cls } = chip(c);
              const glowing = glowKeys.includes(c.key);
              const landedIn =
                c.state === "landed" && c.firstSeen && c.lastPass
                  ? ` Landed in ${daysBetween(c.firstSeen, c.lastPass)} day${daysBetween(c.firstSeen, c.lastPass) > 1 ? "s" : ""} of practice.`
                  : "";
              return (
                <motion.div
                  key={c.key}
                  layout
                  transition={{ duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${cls} ${glowing ? "cfy-chip-glow" : ""}`}
                  title={
                    c.state === "landed"
                      ? `You answered a fresh check on this correctly, more than once.${landedIn}`
                      : c.state === "practiced"
                      ? "You answered a check on this correctly once. One more, another day, confirms it."
                      : c.struggles > 0
                      ? "Worth another look."
                      : "Still working on it."
                  }
                >
                  <Icon size={13} className="shrink-0" />
                  <span className="flex-1 truncate text-xs">{c.label}</span>
                  <span className="text-[10px] opacity-70">
                    {c.state === "landed" ? "landed" : c.state === "practiced" ? "practiced" : c.struggles > 0 ? "revisit" : "working on it"}
                  </span>
                </motion.div>
              );
            })}
          </div>
          {journey.size > 0 && (
            <>
              <button
                onClick={() => setJourneyOpen((v) => !v)}
                title="Your journey: when each concept first came up"
                className="flex items-center gap-1.5 px-1 text-[11px] text-editorial-charcoal/55 hover:text-editorial-charcoal cursor-pointer"
              >
                <Route size={11} /> Journey {journeyOpen ? "▾" : "▸"}
              </button>
              {journeyOpen && (
                <div className="flex flex-col gap-1 px-1">
                  {[...journey.entries()].map(([month, list]) => (
                    <p key={month} className="text-[11px] leading-snug text-editorial-charcoal/60">
                      <span className="text-editorial-charcoal/80">{month}:</span>{" "}
                      {list.map((c) => c.label).join(", ")}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
