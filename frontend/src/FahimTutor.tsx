/**
 * FahimTutor — a self-contained, auth-free tutor view for the pilot.
 *
 * Arabic-first (RTL by default), mobile-first. The flow is:
 *   Board → Grade → Subject → Unit  (cascading selectors, fetched from the API)
 *   → a question textarea → POST /api/tutor/ask → a grounded, trust-signalled answer.
 *
 * TRUST SIGNALS are the point of this view, so they are rendered explicitly:
 *   - a SOURCE chip (which unit + section the answer is grounded in),
 *   - a CONFIDENCE badge (high / medium / low / out_of_syllabus),
 *   - a VERIFICATION badge (Type-A answers that were examiner-checked),
 *   - an honest "grounding: <level>" note when a subject is only syllabus/proxy/
 *     structure grounded (i.e. NOT verbatim textbook), and
 *   - a distinct, calm out-of-syllabus state instead of a fabricated answer.
 *
 * It reuses the existing i18n (useLocale), the bilingual glossary term, and the
 * KaTeX-aware Markdown renderer. No new global state, no auth, no routing.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  CircleHelp,
  Compass,
  Languages,
  Loader2,
  ShieldAlert,
  ShieldQuestion,
} from "lucide-react";
import { Markdown } from "./Markdown";
import { BilingualTerm } from "./i18n/BilingualTerm";
import { useLocale } from "./i18n/LocaleContext";

// Same API base pattern as src/api.ts: VITE_API_URL when set (prod / preview),
// otherwise "" so requests hit /api/* and Vite's dev proxy forwards them.
const API_BASE = import.meta.env.VITE_API_URL || "";

// ---------------------------------------------------------------------------
// API contract types (mirror the pilot's unauthenticated endpoints).
// ---------------------------------------------------------------------------
type AccuracyType = "A" | "B" | "C" | "D";
type Confidence = "high" | "medium" | "low" | "out_of_syllabus";
type Verification = "verified" | "unchecked" | "failed" | "not_applicable";
type GroundingLevel = "textbook" | "syllabus" | "proxy" | "structure";

interface BoardOption {
  board: string;
  label: string;
}
interface GradeOption {
  gradeId: string;
  labelEn: string;
  indiaEquiv: string;
}
interface SubjectOption {
  subjectId: string;
  nameEn: string;
  nameAr: string;
  accuracyType: AccuracyType;
  groundingLevel: GroundingLevel;
}
interface UnitOption {
  unitId: string;
  seq: number;
  titleEn: string;
  titleAr: string;
  hasCorpus: boolean;
}
interface KeyTerm {
  ar: string;
  en: string;
}
interface AskGrounding {
  unitId: string;
  unitTitleEn: string;
  section: string;
  groundednessScore: number;
}
interface AskSource {
  label: string;
  uri: string;
}
interface AskResult {
  text: string;
  accuracyType: AccuracyType;
  confidence: Confidence;
  verification: Verification;
  outOfSyllabus: boolean;
  grounding: AskGrounding;
  sources: AskSource[];
  keyTerms: KeyTerm[];
}

/** Thin GET helper against the same base + /api prefix that api.ts uses. */
async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, { signal });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

/** POST helper for the ask endpoint. */
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Small presentational pieces.
// ---------------------------------------------------------------------------

/** A labelled <select>. Native control so the RTL base direction and mobile
 *  picker come for free. Disabled + hinted while its options are unavailable. */
function SelectField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-editorial-charcoal/70">{label}</span>
      <div className="relative">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-editorial-line bg-white px-3.5 py-2.5 text-sm text-editorial-charcoal transition-colors focus:border-editorial-sage/60 focus:outline-none disabled:cursor-not-allowed disabled:bg-editorial-stone/50 disabled:text-editorial-charcoal/40"
        >
          <option value="">{placeholder}</option>
          {children}
        </select>
      </div>
    </label>
  );
}

/** The confidence badge. Each level has its own calm/warning styling. */
function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const { t } = useLocale();
  const styles: Record<Confidence, string> = {
    high: "bg-emerald-50 text-emerald-700 border-emerald-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-editorial-stone text-editorial-charcoal/55 border-editorial-line",
    out_of_syllabus: "bg-orange-50 text-orange-800 border-orange-300",
  };
  const Icon = confidence === "out_of_syllabus" ? AlertTriangle : CircleHelp;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${styles[confidence]}`}
    >
      <Icon size={12} />
      {t(`tutor.confidence.${confidence}`)}
    </span>
  );
}

/** The verification badge — only meaningful for Type-A answers. */
function VerificationBadge({ verification }: { verification: Verification }) {
  const { t } = useLocale();
  const config: Record<Verification, { cls: string; Icon: typeof BadgeCheck }> = {
    verified: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: BadgeCheck },
    unchecked: { cls: "bg-editorial-stone text-editorial-charcoal/55 border-editorial-line", Icon: ShieldQuestion },
    failed: { cls: "bg-red-50 text-red-700 border-red-200", Icon: ShieldAlert },
    not_applicable: { cls: "bg-editorial-stone text-editorial-charcoal/45 border-editorial-line", Icon: ShieldQuestion },
  };
  const { cls, Icon } = config[verification];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cls}`}>
      <Icon size={12} />
      {t(`tutor.verify.${verification}`)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main view.
// ---------------------------------------------------------------------------
export default function FahimTutor() {
  const { lang, t, setLang } = useLocale();

  // --- Cascading selection state ---
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [grades, setGrades] = useState<GradeOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);

  const [board, setBoard] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [unitId, setUnitId] = useState("");

  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingBoardData, setLoadingBoardData] = useState(false); // grades + subjects
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  // --- Question + answer state ---
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);

  // Guards so a stale in-flight response never overwrites a newer selection.
  const boardReqRef = useRef(0);
  const unitReqRef = useRef(0);

  // 1) Load boards once on mount.
  useEffect(() => {
    const ctrl = new AbortController();
    setLoadingBoards(true);
    setOptionsError(null);
    apiGet<{ boards: BoardOption[] }>("/curriculum/boards", ctrl.signal)
      .then((d) => setBoards(d.boards ?? []))
      .catch((e) => {
        if (e?.name !== "AbortError") setOptionsError(t("tutor.error.load"));
      })
      .finally(() => setLoadingBoards(false));
    return () => ctrl.abort();
    // t is stable per-language; we intentionally load boards only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) When the board changes, reload grades + subjects and reset everything below.
  useEffect(() => {
    if (!board) {
      setGrades([]);
      setSubjects([]);
      return;
    }
    const reqId = ++boardReqRef.current;
    const ctrl = new AbortController();
    setLoadingBoardData(true);
    setOptionsError(null);
    Promise.all([
      apiGet<{ grades: GradeOption[] }>(`/curriculum/grades?board=${encodeURIComponent(board)}`, ctrl.signal),
      apiGet<{ subjects: SubjectOption[] }>(`/curriculum/subjects?board=${encodeURIComponent(board)}`, ctrl.signal),
    ])
      .then(([g, s]) => {
        if (reqId !== boardReqRef.current) return; // superseded
        setGrades(g.grades ?? []);
        setSubjects(s.subjects ?? []);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setOptionsError(t("tutor.error.load"));
      })
      .finally(() => {
        if (reqId === boardReqRef.current) setLoadingBoardData(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  // 3) When subject OR grade changes, reload units. (Both are required by the
  //    units endpoint, so we only fetch once we have both.)
  useEffect(() => {
    if (!subjectId || !gradeId) {
      setUnits([]);
      return;
    }
    const reqId = ++unitReqRef.current;
    const ctrl = new AbortController();
    setLoadingUnits(true);
    setOptionsError(null);
    apiGet<{ units: UnitOption[] }>(
      `/curriculum/units?subjectId=${encodeURIComponent(subjectId)}&gradeId=${encodeURIComponent(gradeId)}`,
      ctrl.signal
    )
      .then((d) => {
        if (reqId !== unitReqRef.current) return;
        setUnits(d.units ?? []);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setOptionsError(t("tutor.error.load"));
      })
      .finally(() => {
        if (reqId === unitReqRef.current) setLoadingUnits(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, gradeId]);

  // --- Cascading reset handlers: changing a level clears everything below it. ---
  const onBoardChange = useCallback((v: string) => {
    setBoard(v);
    setGradeId("");
    setSubjectId("");
    setUnitId("");
    setResult(null);
    setAskError(null);
  }, []);
  const onGradeChange = useCallback((v: string) => {
    setGradeId(v);
    setUnitId("");
    setResult(null);
  }, []);
  const onSubjectChange = useCallback((v: string) => {
    setSubjectId(v);
    setUnitId("");
    setResult(null);
  }, []);
  const onUnitChange = useCallback((v: string) => {
    setUnitId(v);
    setResult(null);
  }, []);

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.subjectId === subjectId),
    [subjects, subjectId]
  );

  const canAsk = Boolean(board && gradeId && subjectId && unitId && question.trim()) && !asking;

  const onAsk = useCallback(async () => {
    if (!canAsk) return;
    setAsking(true);
    setAskError(null);
    setResult(null);
    try {
      const data = await apiPost<AskResult>("/tutor/ask", {
        board,
        gradeId,
        subjectId,
        unitId,
        question: question.trim(),
        language: lang,
      });
      setResult(data);
    } catch {
      setAskError(t("tutor.error.ask"));
    } finally {
      setAsking(false);
    }
  }, [canAsk, board, gradeId, subjectId, unitId, question, lang, t]);

  // Cmd/Ctrl+Enter submits from the textarea.
  const onQuestionKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void onAsk();
      }
    },
    [onAsk]
  );

  // Localised unit title picks the active language, falling back to the other.
  const unitTitle = (u: UnitOption) => (lang === "ar" ? u.titleAr || u.titleEn : u.titleEn || u.titleAr);
  const subjectName = (s: SubjectOption) => (lang === "ar" ? s.nameAr || s.nameEn : s.nameEn || s.nameAr);

  // Show the honest grounding note only when the subject is NOT verbatim-textbook.
  const groundingLevel = selectedSubject?.groundingLevel;
  const showGroundingNote = !!groundingLevel && groundingLevel !== "textbook";

  return (
    <div className="min-h-screen bg-editorial-ivory text-editorial-charcoal">
      {/* Header */}
      <header className="border-b border-editorial-line bg-editorial-ivory/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3.5 md:px-6">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-editorial-sage/10 text-editorial-sage">
            <Compass size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-lg italic text-editorial-charcoal">{t("tutor.title")}</h1>
            <p className="truncate text-[11px] text-editorial-charcoal/60">{t("tutor.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            aria-label={lang === "ar" ? t("lang.switchToEnglish") : t("lang.switchToArabic")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-editorial-line px-3 py-1.5 text-xs font-semibold text-editorial-charcoal/70 transition-colors hover:bg-editorial-stone cursor-pointer"
          >
            <Languages size={14} />
            {lang === "ar" ? "English" : "العربية"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5 md:px-6 md:py-7">
        {/* --- Context selectors --- */}
        <section className="rounded-2xl border border-editorial-line bg-white p-4 md:p-5">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <SelectField
              label={t("tutor.board")}
              value={board}
              onChange={onBoardChange}
              disabled={loadingBoards}
              placeholder={loadingBoards ? t("tutor.loadingOptions") : t("tutor.selectBoard")}
            >
              {boards.map((b) => (
                <option key={b.board} value={b.board}>
                  {b.label}
                </option>
              ))}
            </SelectField>

            <SelectField
              label={t("tutor.grade")}
              value={gradeId}
              onChange={onGradeChange}
              disabled={!board || loadingBoardData}
              placeholder={
                !board
                  ? t("tutor.pickBoardFirst")
                  : loadingBoardData
                    ? t("tutor.loadingOptions")
                    : t("tutor.selectGrade")
              }
            >
              {grades.map((g) => (
                <option key={g.gradeId} value={g.gradeId}>
                  {g.labelEn}
                  {g.indiaEquiv ? ` · ${g.indiaEquiv}` : ""}
                </option>
              ))}
            </SelectField>

            <SelectField
              label={t("tutor.subject")}
              value={subjectId}
              onChange={onSubjectChange}
              disabled={!board || loadingBoardData}
              placeholder={
                !board
                  ? t("tutor.pickBoardFirst")
                  : loadingBoardData
                    ? t("tutor.loadingOptions")
                    : t("tutor.selectSubject")
              }
            >
              {subjects.map((s) => (
                <option key={s.subjectId} value={s.subjectId}>
                  {subjectName(s)}
                </option>
              ))}
            </SelectField>

            <SelectField
              label={t("tutor.unit")}
              value={unitId}
              onChange={onUnitChange}
              disabled={!subjectId || !gradeId || loadingUnits}
              placeholder={
                !subjectId || !gradeId
                  ? t("tutor.pickSubjectGradeFirst")
                  : loadingUnits
                    ? t("tutor.loadingOptions")
                    : t("tutor.selectUnit")
              }
            >
              {units.map((u) => (
                <option key={u.unitId} value={u.unitId}>
                  {u.seq}. {unitTitle(u)}
                </option>
              ))}
            </SelectField>
          </div>

          {optionsError && (
            <p className="mt-3 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-xs leading-relaxed text-red-700">
              <AlertTriangle size={14} className="shrink-0" />
              {optionsError}
            </p>
          )}
        </section>

        {/* --- Question --- */}
        <section className="mt-4 rounded-2xl border border-editorial-line bg-white p-4 md:p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-editorial-charcoal/70">{t("tutor.question")}</span>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={onQuestionKeyDown}
              rows={3}
              placeholder={t("tutor.questionPlaceholder")}
              className="w-full resize-y rounded-xl border border-editorial-line bg-white px-3.5 py-3 text-sm leading-relaxed text-editorial-charcoal placeholder:text-editorial-charcoal/35 transition-colors focus:border-editorial-sage/60 focus:outline-none"
            />
          </label>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => void onAsk()}
              disabled={!canAsk}
              className="inline-flex items-center gap-2 rounded-full bg-editorial-charcoal px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              {asking ? <Loader2 size={15} className="animate-spin" /> : null}
              {asking ? t("tutor.asking") : t("tutor.ask")}
            </button>
          </div>
        </section>

        {/* --- Result / states --- */}
        <section className="mt-4">
          {asking && (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-editorial-line bg-white py-14 text-sm text-editorial-charcoal/60">
              <Loader2 size={15} className="animate-spin" />
              {t("loading.working")}
            </div>
          )}

          {!asking && askError && (
            <p className="flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700">
              <AlertTriangle size={15} className="shrink-0" />
              {askError}
            </p>
          )}

          {!asking && !askError && !result && (
            <div className="rounded-2xl border border-dashed border-editorial-line bg-editorial-stone/30 px-5 py-10 text-center text-sm leading-relaxed text-editorial-charcoal/50">
              {t("tutor.empty")}
            </div>
          )}

          {/* Out-of-syllabus: a calm, distinct state — NOT a normal answer. */}
          {!asking && !askError && result && result.outOfSyllabus && (
            <div className="rounded-2xl border border-orange-200 bg-orange-50/70 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700">
                  <AlertTriangle size={18} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-serif text-lg italic text-orange-900">{t("tutor.oos.title")}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-orange-900/80">{t("tutor.oos.body")}</p>
                  <p className="mt-3 text-xs font-medium text-orange-800/70">{t("tutor.oos.hint")}</p>
                </div>
              </div>
            </div>
          )}

          {/* Normal grounded answer. */}
          {!asking && !askError && result && !result.outOfSyllabus && (
            <article className="rounded-2xl border border-editorial-line bg-white p-4 md:p-5">
              {/* Trust row: source chip + badges */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-editorial-line bg-editorial-stone/60 px-2.5 py-1 text-[11px] font-medium text-editorial-charcoal/75">
                  <BookOpen size={12} className="shrink-0 text-editorial-sage" />
                  <span className="truncate">
                    {result.grounding.unitTitleEn}
                    {result.grounding.section ? ` · ${result.grounding.section}` : ""}
                  </span>
                </span>
                <ConfidenceBadge confidence={result.confidence} />
                {/* Verification is only meaningful for Type-A; still show its
                    not_applicable state calmly rather than hiding it. */}
                <VerificationBadge verification={result.verification} />
              </div>

              {/* Honest grounding note when not verbatim-textbook. */}
              {showGroundingNote && groundingLevel && (
                <p className="mt-3 rounded-lg border border-editorial-line-light bg-editorial-stone/40 px-3 py-2 text-[11px] leading-relaxed text-editorial-charcoal/60">
                  {t("tutor.grounding.note", { level: t(`tutor.grounding.${groundingLevel}`) })}
                </p>
              )}

              {/* The explanation (KaTeX-aware). */}
              <div className="mt-4">
                <Markdown>{result.text}</Markdown>
              </div>

              {/* Key terms glossary. */}
              {result.keyTerms.length > 0 && (
                <div className="mt-5 border-t border-editorial-line-light pt-4">
                  <h3 className="mb-2 text-xs font-semibold text-editorial-charcoal/70">{t("tutor.keyTerms")}</h3>
                  <ul className="flex flex-wrap gap-2">
                    {result.keyTerms.map((term, i) => (
                      <li
                        key={`${term.en}-${i}`}
                        className="rounded-full border border-editorial-line bg-editorial-stone/40 px-3 py-1 text-xs text-editorial-charcoal/80"
                      >
                        <BilingualTerm ar={term.ar} en={term.en} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* References. */}
              {result.sources.length > 0 && (
                <div className="mt-4 border-t border-editorial-line-light pt-4">
                  <h3 className="mb-2 text-xs font-semibold text-editorial-charcoal/70">{t("tutor.sources")}</h3>
                  <ul className="space-y-1">
                    {result.sources.map((src, i) => (
                      <li key={`${src.uri}-${i}`} className="text-xs">
                        <a
                          href={src.uri}
                          target="_blank"
                          rel="noreferrer"
                          className="text-editorial-sage underline underline-offset-2 hover:opacity-80"
                        >
                          {src.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          )}
        </section>
      </main>
    </div>
  );
}
