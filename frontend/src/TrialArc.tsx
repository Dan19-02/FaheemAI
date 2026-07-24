/**
 * First Star: the free week, made visible. A slim strip for trial students
 * that shows which day of their week they are on and the small honest firsts
 * (ask, save, first win, landed) as stars that light up.
 *
 * It celebrates presence and progress only. A star that is not lit is simply
 * not lit yet: no deadline colors, no "hurry", no lost anything. Near the end
 * of the week it states, truthfully, that everything measured comes along on
 * any plan.
 */
import { useState } from "react";
import { Star } from "lucide-react";
import type { Subscription } from "./types";

interface ArcStar {
  key: string;
  label: string;
  done: boolean;
}

function copy() {
  return {
    day: (d: number) => `Free week · day ${d}/7`,
    ask: "First question",
    save: "Save lines",
    win: "First win",
    landed: "Landed",
    keep: (n: number) => `Your ${n} concepts come with you on any plan.`,
  };
}

export function TrialArc({
  subscription,
  doubtsCleared,
  savedCount,
  practiced,
  landed,
  landingEnabled,
  scope,
}: {
  subscription?: Subscription;
  doubtsCleared: number | null;
  savedCount: number | null;
  practiced: number;
  landed: number;
  landingEnabled: boolean;
  scope: string;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`${scope}:trialarc-collapsed`) === "1";
    } catch {
      return false;
    }
  });
  if (!subscription || subscription.plan !== "trial" || subscription.state !== "trial") return null;

  // Day of the 7-day trial, derived from its end date. Clamped: a clock skew
  // must never show "day 0" or "day 9".
  const endMs = subscription.trialEndsAt ? new Date(subscription.trialEndsAt).getTime() : null;
  if (!endMs) return null;
  const daysLeft = Math.max(0, Math.ceil((endMs - Date.now()) / 86_400_000));
  const day = Math.min(7, Math.max(1, 7 - daysLeft + 1));

  const c = copy();
  const wins = practiced + landed;
  const stars: ArcStar[] = [
    { key: "ask", label: c.ask, done: (doubtsCleared ?? 0) > 0 },
    { key: "save", label: c.save, done: (savedCount ?? 0) > 0 },
    ...(landingEnabled
      ? [
          { key: "win", label: c.win, done: wins > 0 },
          { key: "landed", label: c.landed, done: landed > 0 },
        ]
      : []),
  ];

  const toggle = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem(`${scope}:trialarc-collapsed`, v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  };

  return (
    <div className="mb-3 rounded-2xl border border-editorial-line-light bg-editorial-stone/60 px-4 py-2.5">
      <button onClick={toggle} title="Your free week at a glance. Tap to open or tuck away" className="flex w-full items-center justify-between gap-3 cursor-pointer" id="btn-trialarc-toggle">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-editorial-sage">{c.day(day)}</span>
        <span className="flex items-center gap-1" aria-hidden>
          {stars.map((s) => (
            <Star key={s.key} size={12} className={s.done ? "text-amber-500 fill-amber-400" : "text-editorial-charcoal/25"} />
          ))}
        </span>
      </button>
      {!collapsed && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {stars.map((s) => (
            <span key={s.key} className={`flex items-center gap-1.5 text-[11px] ${s.done ? "text-editorial-charcoal/80" : "text-editorial-charcoal/45"}`}>
              <Star size={11} className={s.done ? "text-amber-500 fill-amber-400 shrink-0" : "text-editorial-charcoal/30 shrink-0"} />
              {s.label}
            </span>
          ))}
          {day >= 6 && wins > 0 && (
            <span className="basis-full text-[11px] text-editorial-charcoal/60">{c.keep(wins)}</span>
          )}
        </div>
      )}
    </div>
  );
}
