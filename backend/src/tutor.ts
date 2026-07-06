/**
 * The Fahim accuracy engine (FR3/FR4 + Section 6), wired into an ask endpoint.
 *
 * Flow for one doubt:
 *   1. Resolve the unit + subject (accuracy_type drives the pipeline).
 *   2. Unit-scoped retrieval: embed the question, rank ONLY this unit's corpus
 *      chunks (never the whole corpus). Textbook-grounded subjects use real
 *      chunks; syllabus-scoped subjects fall back to the unit's objectives.
 *   3. Groundedness gate: below RETRIEVAL_GATE on a textbook subject => the query
 *      is OUT OF SYLLABUS and is FLAGGED, never answered from general knowledge.
 *   4. Grounded generation: teach in Arabic (English terms surfaced), grade-
 *      adaptive, framed as the curriculum frames it, from the REFERENCE only.
 *   5. Type A verify-before-display: the worked solution is checked
 *      deterministically (verify.ts) BEFORE returning; Type A never streams.
 *   6. Confidence + sourcing + telemetry (accuracy_events, no student free-text).
 */
import express from "express";
import crypto from "crypto";
import {
  pool,
  getUnit,
  getSubject,
  objectivesForUnit,
  keyTermsForUnit,
  corpusChunksForUnit,
  insertAccuracyEvent,
  type CurriculumUnit,
  type CurriculumSubject,
} from "./db.js";
import { generate, embed } from "./provider.js";
import { cosine } from "./knowledge.js";
import { checkAnswerClaim, type AnswerClaim, type Verification } from "./verify.js";
import { CircuitOpenError } from "./resilience.js";

const RETRIEVAL_GATE = () => Number(process.env.RETRIEVAL_GATE) || 0.62;
const TOP_K = 4;
const MAX_CHUNK_CHARS = 900; // trim each reference chunk to keep prompt (and latency) bounded

export type Confidence = "high" | "medium" | "low" | "out_of_syllabus";

export interface AskInput {
  board: string;
  gradeId: string;
  subjectId: string;
  unitId: string;
  question: string;
  language: "ar" | "en";
}

export interface AskResult {
  text: string;
  accuracyType: string;
  confidence: Confidence;
  verification: Verification;
  outOfSyllabus: boolean;
  grounding: { unitId: string; unitTitleEn: string; section: string; groundednessScore: number };
  sources: { label: string; uri: string }[];
  keyTerms: { ar: string; en: string }[];
}

const secs = (t0: number) => ((Date.now() - t0) / 1000).toFixed(1) + "s";
const gradeNumber = (gradeId: string) => (gradeId.match(/g(\d+)/)?.[1] || "");

/** Reserve expensive HIGH-thinking for genuinely quantitative Type-A problems
 *  (worked numeric solutions). Conceptual questions use default thinking, which
 *  keeps them inside the p95<15s budget. */
const looksQuantitative = (q: string) =>
  /\d/.test(q) || /\b(calculate|solve|find|compute|evaluate|how many|how much|derive|prove)\b/i.test(q) || /احسب|حلّ?|أوجد|كم|برهن|استنتج/.test(q);

/** Pull the first balanced JSON object out of a model response. Provider-agnostic
 *  (we instruct JSON in the prompt rather than using a provider-specific schema). */
function extractJson(text: string): any | null {
  const fenced = text.replace(/```json/gi, "```").split("```");
  const candidates = fenced.length > 1 ? fenced.filter((_, i) => i % 2 === 1) : [text];
  for (const c of [...candidates, text]) {
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(c.slice(start, end + 1));
      } catch {
        /* try next candidate */
      }
    }
  }
  return null;
}

interface Grounding {
  reference: string;
  section: string;
  sources: { label: string; uri: string }[];
  score: number; // top-1 cosine (textbook) or 0 (syllabus fallback)
  level: "textbook" | "syllabus" | "none";
}

/** Retrieve grounding for a unit: real textbook chunks if present, else the
 *  unit's own objectives/key-terms (honest syllabus-scoping). */
async function retrieve(unit: CurriculumUnit, subject: CurriculumSubject, question: string): Promise<Grounding | "out_of_syllabus"> {
  const chunks = await corpusChunksForUnit(pool, unit.unitId);
  const embeddedChunks = chunks.filter((c) => Array.isArray(c.embedding));

  if (embeddedChunks.length > 0) {
    const qv = await embed(question, "RETRIEVAL_QUERY");
    if (!qv) {
      // Embedding unavailable: fall through to syllabus grounding rather than guess.
    } else {
      const scored = embeddedChunks
        .map((c) => ({ c, s: cosine(qv, c.embedding as number[]) }))
        .sort((a, b) => b.s - a.s);
      const top = scored[0];
      if (top.s < RETRIEVAL_GATE()) return "out_of_syllabus"; // textbook says: not in this unit
      const picked = scored.slice(0, TOP_K);
      const seen = new Set<string>();
      const sources = picked
        .map((x) => ({ label: x.c.sectionLabel, uri: "" }))
        .filter((s) => (seen.has(s.label) ? false : (seen.add(s.label), true)));
      return {
        reference: picked.map((x) => `[${x.c.sectionLabel}] ${x.c.contentDisplay.slice(0, MAX_CHUNK_CHARS)}`).join("\n\n"),
        section: top.c.sectionLabel,
        sources,
        score: top.s,
        level: "textbook",
      };
    }
  }

  // Syllabus-scoped fallback: ground on the unit's objectives + key terms.
  const objectives = await objectivesForUnit(pool, unit.unitId);
  const terms = await keyTermsForUnit(pool, unit.unitId);
  if (objectives.length === 0 && terms.length === 0) {
    return "out_of_syllabus"; // structure-only unit: nothing to ground on
  }
  const ref =
    `Unit: ${unit.titleEn}\n` +
    (objectives.length ? `Learning objectives:\n- ${objectives.map((o) => o.textEn).join("\n- ")}\n` : "") +
    (terms.length ? `Key terms: ${terms.map((t) => `${t.termEn}${t.termAr ? " (" + t.termAr + ")" : ""}`).join(", ")}` : "");
  return {
    reference: ref,
    section: `${unit.titleEn} · syllabus objectives`,
    sources: [{ label: `${unit.titleEn} (syllabus outline)`, uri: "" }],
    score: 0,
    level: "syllabus",
  };
}

function buildSystem(subject: CurriculumSubject, grade: string, language: "ar" | "en", groundingLevel: Grounding["level"]): string {
  const lang = language === "en" ? "English" : "Arabic (Modern Standard Arabic)";
  const typeRules: Record<string, string> = {
    A: "This is an objective subject. Show the worked solution step by step with correct method and units. State the final result explicitly.",
    B: "This is a language subject. Be linguistically precise about grammar, usage, and composition.",
    C: "This is an interpretive/factual subject. Stay factually grounded and match the curriculum's framing.",
    D: "This is a sensitive subject and must not be answered here.",
  };
  return [
    `You are Fahim, a patient tutor for a Bahrain school student in grade ${grade || "secondary"}.`,
    `Teach in ${lang}. Teach the CONCEPT step by step, do not just state the answer.`,
    `Surface important technical terms in English in parentheses after the ${language === "en" ? "term" : "Arabic term"}.`,
    `Ground your explanation ONLY in the REFERENCE MATERIAL provided. Frame the concept the way the curriculum frames it.`,
    `If the REFERENCE MATERIAL does not cover the question, say clearly that it is outside the selected unit rather than answering from general knowledge.`,
    `Adapt depth to grade ${grade}: simpler for lower grades, more rigorous for upper grades.`,
    `Be focused: teach the concept clearly without padding. Aim for a concise explanation, longer only when a worked solution genuinely needs the steps.`,
    typeRules[subject.accuracyType] || typeRules.A,
    groundingLevel === "syllabus"
      ? `NOTE: only the syllabus outline is available for this unit (no full textbook), so keep strictly to the listed objectives and do not invent beyond them.`
      : "",
    "Never use em dashes.",
  ].filter(Boolean).join(" ");
}

const OUT_OF_SYLLABUS_MSG: Record<"ar" | "en", string> = {
  ar: "يبدو أن هذا السؤال خارج نطاق الوحدة المختارة. لكي تبقى الإجابة دقيقة ومطابقة للمنهج، اختر الوحدة الصحيحة لهذا الموضوع ثم أعد السؤال.",
  en: "This looks outside the selected unit. To keep the answer curriculum-accurate, pick the unit this topic belongs to and ask again.",
};
const TYPE_D_MSG: Record<"ar" | "en", string> = {
  ar: "هذه المادة قيد المراجعة من مختص مؤهل ولم تُفعّل بعد. لا يقدّم فهيم أحكامًا أو آراء مستقلة.",
  en: "This subject is pending review by a qualified specialist and is not enabled yet. Fahim does not give independent rulings or opinions.",
};

async function logEvent(input: AskInput, subject: CurriculumSubject, r: { groundedness: number | null; verification: Verification; outOfSyllabus: boolean; confidence: Confidence; text: string; latencyMs: number }) {
  try {
    await insertAccuracyEvent(pool, {
      id: crypto.randomUUID(),
      subjectId: subject.subjectId,
      unitId: input.unitId,
      gradeId: input.gradeId,
      language: input.language,
      accuracyType: subject.accuracyType,
      groundedness: r.groundedness,
      verificationOutcome: r.verification,
      outOfSyllabus: r.outOfSyllabus,
      confidence: r.confidence,
      answerHash: crypto.createHash("sha256").update(r.text).digest("hex").slice(0, 16),
      latencyMs: r.latencyMs,
      cacheHit: false,
    });
  } catch (e: any) {
    console.warn("[tutor] telemetry write failed:", e?.message || e);
  }
}

function confidenceBand(groundingLevel: Grounding["level"], score: number, verification: Verification, accuracyType: string): Confidence {
  // Base from retrieval strength; syllabus-scoped is capped at medium (thin grounding).
  let base: Confidence = groundingLevel === "syllabus" ? "medium" : score >= 0.75 ? "high" : score >= RETRIEVAL_GATE() ? "medium" : "low";
  if (accuracyType === "A") {
    if (verification === "failed") return "low";
    if (verification === "verified" && base === "medium" && groundingLevel === "textbook") base = "high";
  }
  return base;
}

export async function askTutor(input: AskInput): Promise<AskResult> {
  const t0 = Date.now();
  const language = input.language === "en" ? "en" : "ar";
  const unit = await getUnit(pool, input.unitId);
  if (!unit) throw Object.assign(new Error("unknown unit_id"), { status: 400 });
  const subject = await getSubject(pool, unit.subjectId);
  if (!subject) throw Object.assign(new Error("unknown subject for unit"), { status: 400 });

  const base = {
    accuracyType: subject.accuracyType,
    grounding: { unitId: unit.unitId, unitTitleEn: unit.titleEn, section: "", groundednessScore: 0 },
    sources: [] as { label: string; uri: string }[],
    keyTerms: (await keyTermsForUnit(pool, unit.unitId)).slice(0, 8).map((t) => ({ ar: t.termAr, en: t.termEn })),
  };

  // Type D: doctrinal — extractive-only, dark until scholar sign-off. Never generate.
  if (subject.accuracyType === "D") {
    const res: AskResult = { ...base, text: TYPE_D_MSG[language], confidence: "out_of_syllabus", verification: "not_applicable", outOfSyllabus: true };
    await logEvent(input, subject, { groundedness: null, verification: "not_applicable", outOfSyllabus: true, confidence: "out_of_syllabus", text: res.text, latencyMs: Date.now() - t0 });
    return res;
  }

  // Retrieve grounding (textbook or syllabus).
  let grounding: Grounding | "out_of_syllabus";
  try {
    grounding = await retrieve(unit, subject, input.question);
  } catch (e: any) {
    grounding = "out_of_syllabus";
  }
  if (grounding === "out_of_syllabus") {
    const res: AskResult = { ...base, text: OUT_OF_SYLLABUS_MSG[language], confidence: "out_of_syllabus", verification: "not_applicable", outOfSyllabus: true };
    await logEvent(input, subject, { groundedness: 0, verification: "not_applicable", outOfSyllabus: true, confidence: "out_of_syllabus", text: res.text, latencyMs: Date.now() - t0 });
    return res;
  }

  base.grounding.section = grounding.section;
  base.grounding.groundednessScore = grounding.score;
  base.sources = grounding.sources;

  const system = buildSystem(subject, gradeNumber(input.gradeId), language, grounding.level);
  const isTypeA = subject.accuracyType === "A";

  const jsonInstruction = isTypeA
    ? `\n\nReturn ONLY a JSON object with two fields:\n` +
      `  "explanation_markdown": the full step-by-step taught solution in ${language === "en" ? "English" : "Arabic"} (markdown, math in $...$).\n` +
      `  "answer_claim": { "checkable": true/false, "finalValue": "the final numeric result as a string (e.g. \\"19.6\\")", "unit": "unit of the result", "givens": [{"name":"symbol","value":"number"}], "expression": "an arithmetic expression using the givens that recomputes finalValue, e.g. \\"sqrt(2*9.8*h)\\"" }.\n` +
      `Set checkable=false if the answer is not a single number (a proof, a definition, a conceptual explanation).`
    : "";

  const prompt =
    `REFERENCE MATERIAL (from the MoE/curriculum unit "${unit.titleEn}"):\n${grounding.reference}\n\n` +
    `STUDENT QUESTION:\n${input.question}${jsonInstruction}`;

  let text = "";
  let verification: Verification = isTypeA ? "unchecked" : "not_applicable";
  try {
    const gen = await generate({ system, prompt, thinking: isTypeA && looksQuantitative(input.question) ? "high" : "default", temperature: 0.2 });
    if (isTypeA) {
      const parsed = extractJson(gen.text);
      if (parsed && typeof parsed.explanation_markdown === "string") {
        text = parsed.explanation_markdown;
        const claim = parsed.answer_claim as AnswerClaim;
        const check = checkAnswerClaim(claim);
        verification = check.verification;
        // Bounded single repair: if the deterministic check FAILS, ask once for a
        // corrected numeric step, then re-check. Never loop again (protects p95).
        if (verification === "failed") {
          const repair = await generate({
            system,
            prompt:
              prompt +
              `\n\nA deterministic check found the final result inconsistent (${check.detail}). ` +
              `Recompute carefully and return the SAME JSON shape with a corrected answer_claim and explanation.`,
            thinking: "high",
            temperature: 0.1,
          });
          const reparsed = extractJson(repair.text);
          if (reparsed && typeof reparsed.explanation_markdown === "string") {
            const recheck = checkAnswerClaim(reparsed.answer_claim as AnswerClaim);
            text = reparsed.explanation_markdown;
            verification = recheck.verification; // verified | failed | unchecked | not_applicable
          }
        }
      } else {
        // Model didn't return parseable JSON: show its text but mark unchecked.
        text = gen.text;
        verification = "unchecked";
      }
    } else {
      text = gen.text;
    }
  } catch (e: any) {
    const busy = e instanceof CircuitOpenError;
    const msg = language === "ar"
      ? "الخدمة مشغولة مؤقتًا. حاول مرة أخرى بعد قليل."
      : "The service is briefly busy. Please try again in a moment.";
    const res: AskResult = { ...base, text: msg, confidence: "low", verification: isTypeA ? "unchecked" : "not_applicable", outOfSyllabus: false };
    console.warn(`[tutor] generation failed (${busy ? "breaker open" : e?.message || e})`);
    await logEvent(input, subject, { groundedness: grounding.score, verification: res.verification, outOfSyllabus: false, confidence: "low", text: res.text, latencyMs: Date.now() - t0 });
    return res;
  }

  const confidence = confidenceBand(grounding.level, grounding.score, verification, subject.accuracyType);
  const res: AskResult = { ...base, text, confidence, verification, outOfSyllabus: false };
  await logEvent(input, subject, { groundedness: grounding.score, verification, outOfSyllabus: false, confidence, text, latencyMs: Date.now() - t0 });
  console.log(`[tutor] ${subject.subjectId}/${unit.unitId} type=${subject.accuracyType} ground=${grounding.level}(${grounding.score.toFixed(2)}) verify=${verification} conf=${confidence} ${secs(t0)}`);
  return res;
}

export const tutorRouter = express.Router();

tutorRouter.post("/tutor/ask", async (req, res) => {
  const { board, gradeId, subjectId, unitId, question, language } = req.body || {};
  if (!unitId || !question || typeof question !== "string" || question.trim().length < 2) {
    return res.status(400).json({ error: "unitId and a non-empty question are required" });
  }
  if (question.length > 4000) return res.status(400).json({ error: "question too long" });
  try {
    const result = await askTutor({
      board: String(board || ""),
      gradeId: String(gradeId || ""),
      subjectId: String(subjectId || ""),
      unitId: String(unitId),
      question: question.trim(),
      language: language === "en" ? "en" : "ar",
    });
    res.json(result);
  } catch (e: any) {
    res.status(e?.status || 500).json({ error: e?.message || "tutor failed" });
  }
});
