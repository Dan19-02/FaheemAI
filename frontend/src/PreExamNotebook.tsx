/**
 * The Pre-exam notebook: every line the student chose to keep, auto-filed by
 * subject and chapter, with one AI-written revision sheet ("Faheem notes")
 * per chapter. Opens as a full-screen overlay on every device.
 *
 * Locked state (trial, Starter, lapsed pass): saving has been quietly working
 * all along, so the lock screen shows how many points are already waiting,
 * with a calm path to the plans. Nothing is ever deleted while locked.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { X, BookMarked, ChevronRight, ArrowLeft, Trash2, Loader2, Sparkles, Lock, RefreshCw } from "lucide-react";
import { api } from "./api";
import type { NotebookSummary, NotebookEntry, ClarifyNote, Subscription } from "./types";
import { Markdown } from "./Markdown";
import { useLocale } from "./i18n/LocaleContext";

interface PreExamNotebookProps {
  open: boolean;
  onClose: () => void;
  subscription?: Subscription;
  /** Open the plan chooser (locked state's call to action). */
  onUpgrade: () => void;
}

type Level = { view: "subjects" } | { view: "chapters"; subject: string } | { view: "points"; subject: string; chapter: string };

export default function PreExamNotebook({ open, onClose, subscription, onUpgrade }: PreExamNotebookProps) {
  const { t, lang } = useLocale();
  const [summary, setSummary] = useState<NotebookSummary | null>(null);
  const [level, setLevel] = useState<Level>({ view: "subjects" });
  const [entries, setEntries] = useState<NotebookEntry[]>([]);
  const [note, setNote] = useState<ClarifyNote | null>(null);
  const [loading, setLoading] = useState(false);
  const [notesBusy, setNotesBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request sequence: any response landing after the student
  // navigated away is dropped, so chapter B can never show chapter A's
  // points or revision sheet.
  const reqSeq = useRef(0);

  // (Re)load the shelf every time the notebook opens; plan changes re-gate it.
  useEffect(() => {
    if (!open) return;
    reqSeq.current++;
    setLevel({ view: "subjects" });
    setEntries([]);
    setNote(null);
    setError(null);
    setNotesBusy(false);
    setLoading(true);
    api
      .getNotebook()
      .then(setSummary)
      .catch((e) => setError(e?.message || t("notebook.openError")))
      .finally(() => setLoading(false));
    // t is stable per language; reloading on a language flip would discard state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subscription?.plan, subscription?.state]);

  // ---- Focus management: move focus in on open, restore it on close ----
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The overlay is in the DOM by the time this effect runs, so focus it
    // synchronously; a deferred (rAF) focus can silently never land.
    overlayRef.current?.focus();
    return () => {
      previousFocus.current?.focus();
    };
  }, [open]);

  // Simple trap: Escape closes, Tab cycles inside the overlay.
  const onOverlayKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const root = overlayRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.hasAttribute("disabled"));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || active === root) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const openChapter = async (subject: string, chapter: string) => {
    const seq = ++reqSeq.current;
    setLevel({ view: "points", subject, chapter });
    setEntries([]);
    setNote(null);
    setError(null);
    setNotesBusy(false);
    setLoading(true);
    try {
      const data = await api.getNotebookChapter(subject, chapter);
      if (seq !== reqSeq.current) return; // navigated away meanwhile
      setEntries(data.entries);
      setNote(data.note);
    } catch (e: any) {
      if (seq === reqSeq.current) setError(e?.message || t("notebook.loadChapterError"));
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  };

  const removeEntry = async (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    // The cached note is stale the moment the points change.
    setNote((n) => (n ? { ...n, stale: true } : n));
    try {
      await api.deleteNotebookEntry(id);
    } catch {
      /* optimistic: worst case the point reappears on next open */
    }
  };

  const makeNotes = async (subject: string, chapter: string) => {
    const seq = reqSeq.current;
    setNotesBusy(true);
    setError(null);
    try {
      const fresh = await api.generateClarifyNotes(subject, chapter);
      if (seq !== reqSeq.current) return; // navigated away: never paint into another chapter
      setNote(fresh);
    } catch (e: any) {
      if (seq === reqSeq.current) setError(e?.message || t("notebook.notesError"));
    } finally {
      if (seq === reqSeq.current) setNotesBusy(false);
    }
  };

  if (!open) return null;

  const back = () => {
    reqSeq.current++; // any in-flight response for the old view is now stale
    setError(null);
    setNotesBusy(false);
    if (level.view === "points") setLevel({ view: "chapters", subject: level.subject });
    else if (level.view === "chapters") setLevel({ view: "subjects" });
  };

  const dateLocale = lang === "ar" ? "ar-BH" : "en-GB";

  return (
    <div
      className="fixed inset-0 z-[55] flex flex-col bg-editorial-ivory outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={t("notebook.title")}
      ref={overlayRef}
      tabIndex={-1}
      onKeyDown={onOverlayKeyDown}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-editorial-line bg-editorial-ivory px-4 py-3 md:px-8">
        {level.view !== "subjects" && !summary?.locked ? (
          <button
            onClick={back}
            aria-label={t("common.back")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-editorial-line text-editorial-charcoal/60 transition-colors hover:bg-editorial-stone cursor-pointer"
          >
            <ArrowLeft size={15} className="rtl:rotate-180" />
          </button>
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-editorial-sage/10 text-editorial-sage">
            <BookMarked size={16} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate fh-display text-lg text-[var(--color-ink)]">
            {level.view === "points" ? level.chapter : level.view === "chapters" ? level.subject : t("notebook.title")}
          </h2>
          <p className="truncate text-[11px] text-editorial-charcoal/70">
            {level.view === "subjects"
              ? t("notebook.subtitleSubjects")
              : level.view === "chapters"
              ? t("notebook.subtitleChapters")
              : t("notebook.subtitlePoints", { subject: level.subject })}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label={t("notebook.close")}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-editorial-line text-editorial-charcoal/50 transition-colors hover:bg-editorial-stone cursor-pointer"
          id="btn-notebook-close"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-5 md:px-8">
        <div className="mx-auto max-w-3xl">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-editorial-charcoal/60">
              <Loader2 size={15} className="animate-spin" /> {t("notebook.opening")}
            </div>
          )}

          {error && (
            <p role="alert" className="mb-4 rounded-xl border border-[var(--color-red)]/20 bg-[var(--color-red)]/8 px-4 py-2.5 text-xs leading-relaxed text-[var(--color-red)]">
              {error}
            </p>
          )}

          {/* Locked: calm, honest, shows the value already waiting. */}
          {!loading && summary?.locked && (
            <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-editorial-sage/10 text-editorial-sage">
                <Lock size={22} />
              </div>
              <h3 className="fh-display text-2xl text-[var(--color-ink)]">
                {summary.savedCount > 0
                  ? t("notebook.lockedWaiting", { n: summary.savedCount })
                  : t("notebook.lockedReady")}
              </h3>
              <p className="text-sm leading-relaxed text-editorial-charcoal/70">{t("notebook.lockedBody")}</p>
              <button
                onClick={onUpgrade}
                className="rounded-full bg-editorial-charcoal px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
                id="btn-notebook-upgrade"
              >
                {t("notebook.seePlans")}
              </button>
            </div>
          )}

          {/* Subjects shelf */}
          {!loading && summary && !summary.locked && level.view === "subjects" && (
            <>
              {(summary.subjects?.length || 0) === 0 ? (
                <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-14 text-center">
                  <BookMarked size={26} className="text-editorial-sage" />
                  <h3 className="fh-display text-xl text-[var(--color-ink)]">{t("notebook.emptyTitle")}</h3>
                  <p className="text-sm leading-relaxed text-editorial-charcoal/70">{t("notebook.emptyBody")}</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {summary.subjects!.map((s) => (
                    <button
                      key={s.subject}
                      onClick={() => setLevel({ view: "chapters", subject: s.subject })}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-editorial-line bg-white p-5 text-start transition-all hover:border-editorial-sage/40 cursor-pointer"
                    >
                      <div>
                        <h3 className="fh-display text-lg text-[var(--color-ink)]">{s.subject}</h3>
                        <p className="mt-1 text-xs text-editorial-charcoal/70">
                          {t("notebook.chaptersCount", { n: s.chapters.length })} · {t("notebook.pointsCount", { n: s.count })}
                        </p>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-editorial-charcoal/35 rtl:rotate-180" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Chapters in a subject */}
          {!loading && summary && !summary.locked && level.view === "chapters" && (
            <div className="flex flex-col gap-2.5">
              {(summary.subjects?.find((s) => s.subject === level.subject)?.chapters || []).map((c) => (
                <button
                  key={c.chapter}
                  onClick={() => openChapter(level.subject, c.chapter)}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-editorial-line bg-white px-5 py-4 text-start transition-all hover:border-editorial-sage/40 cursor-pointer"
                >
                  <div>
                    <h4 className="text-sm font-semibold text-editorial-charcoal">{c.chapter}</h4>
                    <p className="mt-0.5 text-[11px] text-editorial-charcoal/70">
                      {t("notebook.savedPointsCount", { n: c.count })}
                    </p>
                  </div>
                  <ChevronRight size={15} className="shrink-0 text-editorial-charcoal/35 rtl:rotate-180" />
                </button>
              ))}
            </div>
          )}

          {/* One chapter: Faheem notes + the saved points */}
          {!loading && level.view === "points" && (
            <div className="flex flex-col gap-5">
              {/* Faheem notes */}
              <div className="rounded-2xl border border-editorial-line bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-editorial-charcoal">
                    <Sparkles size={14} className="text-editorial-sage" /> {t("notebook.clarifyNotes")}
                  </h3>
                  <button
                    onClick={() => makeNotes(level.subject, level.chapter)}
                    disabled={notesBusy || entries.length === 0 || (note !== null && !note.stale)}
                    className="flex items-center gap-1.5 rounded-full bg-editorial-sage px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer"
                    id="btn-clarify-notes"
                    title={note && !note.stale ? t("notebook.notesUpToDateTitle") : t("notebook.notesMakeTitle")}
                  >
                    {notesBusy ? (
                      <>
                        <Loader2 size={13} className="animate-spin" /> {t("notebook.preparing")}
                      </>
                    ) : note ? (
                      <>
                        <RefreshCw size={13} /> {note.stale ? t("notebook.refreshNotes") : t("notebook.upToDate")}
                      </>
                    ) : (
                      <>{t("notebook.clarifyNotes")}</>
                    )}
                  </button>
                </div>
                {notesBusy && (
                  <p className="mt-3 text-xs leading-relaxed text-editorial-charcoal/70">
                    {t("notebook.notesBusyBody", { n: entries.length })}
                  </p>
                )}
                {note && !notesBusy && (
                  <div className="mt-4 border-t border-editorial-line-light pt-4 text-sm leading-relaxed text-editorial-charcoal">
                    <Markdown>{note.text}</Markdown>
                    <p className="mt-3 text-[10px] text-editorial-charcoal/60">
                      {t("notebook.notesPrepared", { date: new Date(note.generatedAt).toLocaleString(dateLocale) })}
                      {note.stale ? t("notebook.notesStale") : ""}
                    </p>
                  </div>
                )}
                {!note && !notesBusy && (
                  <p className="mt-3 text-xs leading-relaxed text-editorial-charcoal/70">{t("notebook.notesEmptyBody")}</p>
                )}
              </div>

              {/* The saved points */}
              <div className="flex flex-col gap-2.5">
                {entries.map((e) => (
                  <div key={e.id} className="group rounded-2xl border border-editorial-line-light bg-white p-4">
                    {e.question && (
                      <p className="mb-1.5 text-[11px] text-[var(--color-ink)]/60">
                        {t("notebook.entryFrom", { q: e.question.slice(0, 120) })}
                      </p>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 text-sm leading-relaxed text-editorial-charcoal">
                        <Markdown>{e.text}</Markdown>
                      </div>
                      <button
                        onClick={() => removeEntry(e.id)}
                        title={t("notebook.removePoint")}
                        aria-label={t("notebook.removePoint")}
                        className="shrink-0 rounded-full p-1.5 text-[var(--color-ink)]/30 transition-colors hover:bg-[var(--color-red)]/8 hover:text-[var(--color-red)] cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
                {entries.length === 0 && !loading && (
                  <p className="py-6 text-center text-sm text-editorial-charcoal/70">{t("notebook.noPointsLeft")}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
