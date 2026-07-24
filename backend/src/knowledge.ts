/**
 * Retrieval (RAG) + embeddings + topic gating + deep-verify.
 *
 * - embed(): Gemini embeddings with taskType=SEMANTIC_SIMILARITY (better
 *   calibrated for paraphrase/similarity than the default), with graceful
 *   fallback. The same taskType is used for the corpus, the query, and the
 *   semantic cache so all vectors are comparable.
 * - Seed corpus of curriculum notes (subject fundamentals, "General" track).
 *   Retrieval prefers the student's curriculum (and universal "General" facts).
 * - topicTokens()/topicCompatible(): gate the semantic cache so it never
 *   reuses an answer across unrelated topics (e.g. osmosis vs diffusion).
 * - verifyAnswer(): optional deep-verify examiner pass.
 * - canonicalizeConcept(): background shadow canonical ids for concept keys.
 */
import { ai, apiKey } from "./gemini.js";
import { kimiGenerate, kimiIsAnswerBackend } from "./kimi.js";
import {
  pool, dbMode, knowledgeCount, knowledgeIds, knowledgeInsert, knowledgeAll, knowledgeDeleteAll,
  cacheClearMismatchedEmbeddings, canonAll, canonInsert, getConceptMastery, upsertConceptMastery,
  type Queryable,
} from "./db.js";
import { SYLLABUS_CORPUS, type SyllabusChunk } from "./data/syllabusCorpus.js";

// gemini-embedding-001 is the live embeddings model. text-embedding-004 was
// retired from the API (404s as of 2026-07-02) and is no longer tried.
const EMBED_MODELS = ["gemini-embedding-001"];
let chosenEmbedModel: string | null = null;

/** Seconds elapsed since t0, formatted for the latency trace logs. */
export const secs = (t0: number) => ((Date.now() - t0) / 1000).toFixed(1) + "s";

// Short-lived embed memo: the same question is often embedded twice within
// seconds (the /chat/stream -> /chat fallback retry pair), and concept labels
// repeat across canonicalization. One entry saves a full network call.
const embedMemo = new Map<string, { v: number[]; at: number }>();
const EMBED_MEMO_TTL_MS = 10 * 60_000;
const EMBED_MEMO_MAX = 300;

export async function embed(text: string, taskType = "SEMANTIC_SIMILARITY"): Promise<number[] | null> {
  if (!apiKey || !text?.trim()) return null;
  const memoKey = `${taskType}\n${text}`;
  const hit = embedMemo.get(memoKey);
  if (hit && Date.now() - hit.at < EMBED_MEMO_TTL_MS) return hit.v;
  const models = chosenEmbedModel ? [chosenEmbedModel] : EMBED_MODELS;
  const embedT0 = Date.now();
  for (const model of models) {
    // Try with taskType first; fall back to no-config if the model rejects it.
    for (const cfg of [{ taskType }, undefined] as const) {
      const t0 = Date.now();
      console.log(`[GEMINI_EMBED] start (model=${model}, cfg=${cfg ? "taskType" : "plain"})`);
      try {
        const r: any = await ai.models.embedContent({ model, contents: text, ...(cfg ? { config: cfg } : {}) });
        const values: number[] | undefined = r?.embeddings?.[0]?.values || r?.embedding?.values;
        if (Array.isArray(values) && values.length) {
          chosenEmbedModel = model;
          console.log(`[GEMINI_EMBED] end - ${secs(t0)} (model=${model}, dims=${values.length})`);
          if (embedMemo.size >= EMBED_MEMO_MAX) {
            const cutoff = Date.now() - EMBED_MEMO_TTL_MS;
            for (const [k, e] of embedMemo) if (e.at < cutoff) embedMemo.delete(k);
            if (embedMemo.size >= EMBED_MEMO_MAX) embedMemo.clear();
          }
          embedMemo.set(memoKey, { v: values, at: Date.now() });
          return values;
        }
        console.warn(`[GEMINI_EMBED] empty - ${secs(t0)} (model=${model}), trying next`);
      } catch (e: any) {
        // Each failed attempt here may itself hide up to 5 SDK-internal retries.
        console.warn(`[GEMINI_EMBED] failed - ${secs(t0)} (model=${model}, cfg=${cfg ? "taskType" : "plain"}): ${e?.message || e}`);
      }
    }
  }
  console.warn(`[GEMINI_EMBED] gave up - ${secs(embedT0)} (all models/configs failed)`);
  return null;
}

/**
 * Embed many texts in one API call (the embed endpoint accepts an array of
 * contents). Used by corpus ingestion, where per-item calls would take minutes
 * for the syllabus corpus. Falls back to per-item embed() if the batch call
 * fails, so ingestion degrades rather than dies.
 */
async function embedBatch(texts: string[], taskType = "SEMANTIC_SIMILARITY"): Promise<(number[] | null)[]> {
  if (!apiKey || texts.length === 0) return texts.map(() => null);
  const model = chosenEmbedModel || EMBED_MODELS[0];
  const t0 = Date.now();
  try {
    const r: any = await ai.models.embedContent({ model, contents: texts, config: { taskType } });
    const embs: any[] = r?.embeddings || [];
    if (Array.isArray(embs) && embs.length === texts.length) {
      chosenEmbedModel = model;
      console.log(`[GEMINI_EMBED] batch end - ${secs(t0)} (model=${model}, n=${texts.length})`);
      return embs.map((e) => (Array.isArray(e?.values) && e.values.length ? e.values : null));
    }
    console.warn(`[GEMINI_EMBED] batch shape mismatch (${embs.length}/${texts.length}); falling back to per-item embeds.`);
  } catch (e: any) {
    console.warn(`[GEMINI_EMBED] batch of ${texts.length} failed - ${secs(t0)} (${e?.message || e}); falling back to per-item embeds.`);
  }
  const out: (number[] | null)[] = [];
  for (const t of texts) out.push(await embed(t, taskType));
  return out;
}

export function cosine(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

const STOPWORDS = new Set(
  "a an the is are was were be of for to from in into on at with and or but what whats which who whom how why when where do does did explain define describe tell me about please give show find calculate solve simple simply detail short brief words word can you i my mean meaning concept topic".split(/\s+/)
);

/** Significant content tokens of a question (used to topic-gate the cache). */
export function topicTokens(message: string): Set<string> {
  return new Set(
    (message || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  );
}

/**
 * Whether two questions are about the SAME thing for cache-reuse purposes.
 * Rule: one question's content tokens must be a subset of the other's. This
 * allows paraphrases that only add filler ("process of photosynthesis" ⊇
 * "photosynthesis") but blocks pairs that differ by a meaningful token
 * ("newton FIRST law" vs "newton SECOND law", "KINETIC energy" vs "POTENTIAL
 * energy"), which would otherwise be wrongly reused.
 */
export function topicCompatible(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return a.size === b.size;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (!big.has(t)) return false;
  return true;
}

// Curriculum-aware seed corpus. "General" facts are served to every student;
// entries can carry a curriculum tag for track-specific framing. Expand this
// (or ingest real per-curriculum textbook content + pgvector) for production
// coverage.
const SEED_CORPUS = [
  { id: "k-newton2", subject: "Physics", topic: "Newton's Second Law", board: "General", grade: "11",
    content: "Newton's Second Law: net force equals rate of change of momentum; for constant mass F = m·a. Force in newtons (N). The same force gives a lighter body a larger acceleration." },
  { id: "k-newton1", subject: "Physics", topic: "Newton's First Law (Inertia)", board: "General", grade: "11",
    content: "Newton's First Law (inertia): a body stays at rest or in uniform straight-line motion unless acted on by a net external force. Inertia increases with mass." },
  { id: "k-kinematics", subject: "Physics", topic: "Equations of Motion", board: "General", grade: "11",
    content: "For constant acceleration: v = u + a·t; s = u·t + ½·a·t²; v² = u² + 2·a·s. For a body thrown up, at the top v = 0 and a = -g (g ≈ 9.8 m/s², often 10 in problems)." },
  { id: "k-ohm", subject: "Physics", topic: "Ohm's Law", board: "General", grade: "10",
    content: "Ohm's Law: at constant temperature, V = I·R, current proportional to voltage; R in ohms (Ω). Does not hold for non-ohmic devices like diodes." },
  { id: "k-photosynthesis", subject: "Biology", topic: "Photosynthesis", board: "General", grade: "11",
    content: "Photosynthesis: 6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂, in chloroplasts. Light reactions in thylakoids make ATP/NADPH; the Calvin cycle fixes carbon in the stroma." },
  { id: "k-mitosis", subject: "Biology", topic: "Mitosis vs Meiosis", board: "General", grade: "11",
    content: "Mitosis → two identical diploid cells (growth/repair). Meiosis → four varied haploid gametes via two divisions; crossing over in prophase I creates variation." },
  { id: "k-quadratic", subject: "Mathematics", topic: "Quadratic Equations", board: "General", grade: "10",
    content: "ax² + bx + c = 0 (a≠0): roots x = (-b ± √(b²-4ac))/(2a). Discriminant D = b²-4ac: D>0 two distinct real, D=0 equal, D<0 no real roots. Sum = -b/a, product = c/a." },
  { id: "k-bonding", subject: "Chemistry", topic: "Chemical Bonding & Valency", board: "General", grade: "11",
    content: "Atoms bond to attain a stable (octet) configuration. Ionic bonds transfer electrons (metal+non-metal); covalent bonds share (non-metals). Valency = combining capacity." },
  { id: "k-mole", subject: "Chemistry", topic: "Mole Concept", board: "General", grade: "11",
    content: "One mole = 6.022×10²³ particles (Avogadro's number). Moles = mass / molar mass. Molar volume of an ideal gas at STP ≈ 22.4 L." },
  { id: "k-trig", subject: "Mathematics", topic: "Trigonometric Ratios", board: "General", grade: "10",
    content: "In a right triangle: sin θ = opposite/hypotenuse, cos θ = adjacent/hypotenuse, tan θ = opposite/adjacent. Identity: sin²θ + cos²θ = 1." },
  { id: "k-refraction", subject: "Physics", topic: "Refraction of Light", board: "General", grade: "10",
    content: "Refraction: light bends when it crosses into another medium because its speed changes; it bends toward the normal entering a denser medium (air to water/glass) and away from the normal when leaving. Refractive index n = c/v (no units). Snell's law: sin i / sin r is constant for a given pair of media. Everyday effects: a pencil or straw part-dipped in water looks bent at the surface; a coin at the bottom of water looks raised (apparent depth is less than real depth)." },
  { id: "k-free-fall", subject: "Physics", topic: "Free Fall (Motion in a Straight Line)", board: "General", grade: "11",
    content: "Free fall: motion under gravity alone. 'Dropped' means u = 0; then v = g·t, h = ½·g·t², v² = 2·g·h. g ≈ 9.8 m/s² (many problems use 10 for clean numbers, which slightly changes answers). Common traps: forgetting u = 0 for a dropped body, mixing sign conventions for upward vs downward motion, dropping units." },
  { id: "k-electricity-10", subject: "Physics", topic: "Electricity (circuits)", board: "General", grade: "10",
    content: "Series circuit: the same current flows through every element and voltages add (R_eq = R₁ + R₂ + ...). Parallel circuit: the same voltage sits across each branch and currents add (1/R_eq = 1/R₁ + 1/R₂ + ...). Ohm's law V = I·R applies per element; power P = V·I = I²·R." },
  // Exam-technique framing (accurate study guidance, not invented facts)
  { id: "k-exam-technique", subject: "Study Guidance", topic: "Exam answer technique", board: "General", grade: "11",
    content: "Written exams reward clear, structured answers: a precise definition or statement first, then the key points or worked steps, then a short conclusion. For numericals, show every step, keep units throughout, and check the final answer by substituting it back. Practise past papers to learn how answers are marked." },
];

/** The full ingestable corpus: universal seed facts plus the generated GCC
 *  syllabus corpus (see data/syllabusCorpus.ts). The syllabus corpus is
 *  skipped on the in-memory dev database, where every restart would re-embed
 *  all ~470 chunks (minutes of API calls for data that vanishes on exit);
 *  set SYLLABUS_INGEST=force to include it there anyway. */
function activeCorpus(): SyllabusChunk[] {
  const includeSyllabus = dbMode === "postgres" || process.env.SYLLABUS_INGEST === "force";
  if (!includeSyllabus) {
    console.log(`[RAG] In-memory dev DB: skipping the ${SYLLABUS_CORPUS.length}-chunk GCC syllabus corpus (SYLLABUS_INGEST=force to include).`);
    return [...SEED_CORPUS];
  }
  return [...SEED_CORPUS, ...SYLLABUS_CORPUS];
}

/** Batch-embed and insert corpus chunks; returns how many actually landed. */
async function embedAndInsert(chunks: SyllabusChunk[]): Promise<number> {
  const BATCH = 24;
  let ok = 0;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const vecs = await embedBatch(slice.map((c) => c.content));
    for (let j = 0; j < slice.length; j++) {
      const e = vecs[j];
      if (!e) continue;
      await knowledgeInsert(pool, { ...slice[j], embedding: e });
      ok++;
    }
  }
  return ok;
}

/** Embed and store the seed corpus once (idempotent). */
export async function ingestKnowledge(): Promise<void> {
  // Any ingest outcome may change the corpus: drop the cache and advance the
  // epoch so in-flight reads cannot re-populate it with a partial table.
  corpusEpoch++;
  corpusCache = null;
  try {
    if (!apiKey) {
      console.warn("[RAG] No GEMINI_API_KEY: skipping knowledge ingestion (RAG disabled).");
      return;
    }
    const corpus = activeCorpus();
    const existing = await knowledgeCount(pool);
    if (existing > 0) {
      // Vectors only match when their dimensions agree, so rows embedded by a
      // retired model (768-dim text-embedding-004) silently kill RAG and the
      // semantic cache. Probe the live model once and re-ingest on mismatch.
      const probe = await embed("dimension probe");
      const rows = probe ? await knowledgeAll(pool) : [];
      const stale = probe ? rows.some((r) => Array.isArray(r.embedding) && r.embedding.length !== probe.length) : false;
      if (!stale) {
        // Top up corpus chunks added since this database was first ingested
        // (new seed facts OR a regenerated syllabus corpus); without this,
        // new corpus entries never land on an existing install.
        const have = new Set(await knowledgeIds(pool));
        const missing = corpus.filter((c) => !have.has(c.id));
        if (missing.length > 0) {
          const added = await embedAndInsert(missing);
          console.log(`[RAG] Topped up ${added}/${missing.length} new knowledge chunks (${existing} already present).`);
        } else {
          console.log(`[RAG] Knowledge base ready (${existing} chunks).`);
        }
        return;
      }
      console.warn(`[RAG] Stored embeddings do not match the live model (${probe!.length} dims): re-ingesting the corpus and clearing mismatched cache vectors.`);
      await knowledgeDeleteAll(pool);
      try {
        await cacheClearMismatchedEmbeddings(pool, probe!.length);
      } catch {
        /* engine without jsonb_array_length: harmless, stale vectors simply never match */
      }
    }
    const ok = await embedAndInsert(corpus);
    console.log(`[RAG] Ingested ${ok}/${corpus.length} knowledge chunks${ok ? "" : " (embeddings unavailable)"}.`);
  } catch (e: any) {
    console.warn("[RAG] Ingestion skipped:", e.message);
  } finally {
    // A request served mid-ingest may have cached a partial corpus: drop it
    // and advance the epoch so late-resolving reads cannot re-cache it.
    corpusEpoch++;
    corpusCache = null;
  }
}

/**
 * Top relevant notes for a question (given its embedding), preferring the
 * student's curriculum and universal "General" facts. Returns null if nothing fits.
 */
// The corpus only changes at startup ingest, so hold it in memory instead of
// re-fetching every embedded row from Postgres on each cache-miss request.
// The epoch guards against a read that STARTED mid-ingest resolving after the
// post-ingest invalidation and caching a partial corpus forever.
let corpusCache: Awaited<ReturnType<typeof knowledgeAll>> | null = null;
let corpusEpoch = 0;

export async function retrieveContext(
  queryEmbedding: number[] | null,
  board = "",
  k = 2,
  threshold = 0.6
): Promise<string | null> {
  if (!queryEmbedding) return null;
  let rows;
  try {
    rows = corpusCache;
    if (!rows) {
      const epoch = corpusEpoch;
      rows = await knowledgeAll(pool);
      if (epoch === corpusEpoch) corpusCache = rows;
    }
  } catch {
    return null;
  }
  const b = (board || "").toLowerCase();
  const scored = rows
    .filter((r) => Array.isArray(r.embedding))
    .map((r) => {
      const cb = (r.board || "").toLowerCase();
      const boardMatch = cb === "general" || (b && cb === b);
      return { r, s: cosine(queryEmbedding, r.embedding) + (boardMatch ? 0.05 : -0.05) };
    })
    .filter((x) => x.s >= threshold)
    .sort((a, b2) => b2.s - a.s)
    .slice(0, k);
  if (!scored.length) return null;
  // The grade level travels with every note so the model can never honestly
  // place a grade 10 chapter inside a grade 11 student's own book.
  return scored
    .map(
      (x) =>
        `• [${x.r.subject}: ${x.r.topic}${x.r.board && x.r.board !== "General" ? " · " + x.r.board : ""}${
          x.r.grade ? ` · Grade ${x.r.grade}` : ""
        }] ${x.r.content}`
    )
    .join("\n\n");
}

export interface VerifyResult {
  text: string;
  /** True only when the examiner pass actually ran. False means the draft is
   *  returned unverified (missing key or examiner call failed), and the caller
   *  must surface that honestly rather than implying the answer was checked. */
  verified: boolean;
}

const VERIFY_SYSTEM =
  "You are a meticulous subject examiner for school and exam-prep material. You fix factual and mathematical errors, soften false absolutes that have real exceptions, and finish the main worked solution if it stops short of its numerical result, all while preserving the warm tone, the student's language (English, Arabic, Hindi, or Urdu), and any section/notebook formatting. You NEVER answer or complete the closing self-check question the tutor leaves for the student; that always stays open. Output only the (corrected) answer.";
const verifyPrompt = (question: string, answer: string) =>
  `Student's question:\n${question}\n\nDraft answer to review:\n${answer}\n\n` +
  `Carefully check it for: (1) any factual error, wrong formula, or calculation mistake; ` +
  `(2) any FALSE ABSOLUTE, a rule of thumb stated as "always" or "never" that has real exceptions, which you must soften to "usually" or "in most cases" WITHOUT weakening a genuinely universal law; ` +
  `(3) the MAIN worked solution left with only a method but no final numerical result, which you should finish; ` +
  `(4) a MAIN numerical solution whose final answer is stated with NO verification at all (no plug-back, no recomputation by a second route, no unit check): append that verification in one or two short sentences, in the answer's own language, without changing the result. ` +
  `CRITICAL: preserve exactly as-is the closing self-check question the tutor poses to the student. NEVER answer, solve, hint at, or complete that closing question; it must stay open and unanswered. Items (3) and (4) apply only to the main solution, never to the closing check. ` +
  `If you find a real issue in (1) to (4), return a corrected version in the SAME format, language, and warm tone. ` +
  `If it is fully correct, return it unchanged. Output ONLY the final answer.`;

/** Optional deep-verify: a meticulous examiner pass that corrects errors.
 *  Runs on the active answer backend so the fact-check net survives even when
 *  Gemini is unavailable: Kimi when it is the answer brain, else Gemini. */
export async function verifyAnswer(question: string, answer: string): Promise<VerifyResult> {
  const t0 = Date.now();
  // Kimi examiner (no web search: this is a pure correctness pass on the draft).
  if (kimiIsAnswerBackend) {
    console.log(`[KIMI_VERIFY] start (draft chars=${answer.length})`);
    try {
      const out = await kimiGenerate({ system: VERIFY_SYSTEM, message: verifyPrompt(question, answer) });
      console.log(`[KIMI_VERIFY] end - ${secs(t0)} (chars=${out.text.length})`);
      return { text: out.text, verified: true };
    } catch (e: any) {
      console.warn(`[KIMI_VERIFY] failed - ${secs(t0)}, returning the answer unverified: ${e?.message || e}`);
      return { text: answer, verified: false };
    }
  }
  if (!apiKey) {
    console.warn("[Verify] Deep-check unavailable: GEMINI_API_KEY missing, returning the answer unverified.");
    return { text: answer, verified: false };
  }
  console.log(`[GEMINI_VERIFY] start (draft chars=${answer.length})`);
  try {
    const r = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: verifyPrompt(question, answer) }] }],
      config: { temperature: 0.1, systemInstruction: VERIFY_SYSTEM },
    });
    // An empty examiner response means nothing was actually checked.
    if (!r.text) {
      console.warn(`[GEMINI_VERIFY] empty - ${secs(t0)}, treating the answer as unverified.`);
      return { text: answer, verified: false };
    }
    console.log(`[GEMINI_VERIFY] end - ${secs(t0)} (chars=${r.text.length})`);
    return { text: r.text, verified: true };
  } catch (e: any) {
    console.warn(`[GEMINI_VERIFY] failed - ${secs(t0)}, returning the answer unverified: ${e?.message || e}`);
    return { text: answer, verified: false };
  }
}

// ---- Student check grading (the Landing Signal's only gold source) --------

export type CheckGrade = "pass" | "partial" | "fail" | "skip";

const GRADE_SYSTEM =
  "You are a STRICT, skeptical examiner deciding whether a school student (grades 6-12) has genuinely UNDERSTOOD a concept, from their latest message, which MAY or may not be an attempt at the check you were given. You are NOT their warm tutor; do not be generous. Understanding means the student can APPLY the idea, not echo it. Output MUST be exactly one word: PASS, PARTIAL, FAIL, or SKIP.";

const gradePrompt = (concept: string, check: string, studentAnswer: string) =>
  `Concept being tested: ${concept}\n\nThe check the student was asked to answer:\n${check}\n\nThe student's answer (verbatim):\n${studentAnswer}\n\n` +
  `Grade STRICTLY. Rules:\n` +
  `- SKIP (not a grade) if the message is NOT an attempt at THIS check: they asked a different/new question, changed the topic, or it is small talk. Only grade a genuine attempt.\n` +
  `- FAIL if the answer is a real attempt but wrong or blank.\n` +
  `- FAIL if it is only thanks / affirmation ("got it", "ok", "clear") with no actual reasoning.\n` +
  `- FAIL if it merely repeats or copies the wording of the taught concept without applying it (recognition, not understanding).\n` +
  `- FAIL if the check was a simple yes/no or two-option pick and the student just guessed one option with NO reasoning (a coin-flip is not understanding).\n` +
  `- PARTIAL if the instinct is right but a key step is missing, muddled, or the reasoning is incomplete.\n` +
  `- PASS only if the student actively produced CORRECT reasoning that shows they can apply the concept to this new case.\n` +
  `When unsure between two grades, choose the LOWER one. If it is not an attempt at this check at all, output SKIP. Output exactly one word: PASS, PARTIAL, FAIL, or SKIP.`;

// ---- Ready-to-Land: server-posed confirmation checks ----------------------

const CONFIRM_QUESTION_SYSTEM =
  "You are Faheem, a warm, patient tutor for school students (grades 6-12). You write exactly ONE short transfer-check question and nothing else: no greeting, no answer, no hints, no options, no labels, no quotes around it.";

const confirmQuestionPrompt = (concept: string, grade: string, board: string, language: string) =>
  `A student understood "${concept}" yesterday and is back to confirm it stuck. Write ONE fresh transfer-check question on "${concept}" for a ${grade} ${board} student.\n` +
  `Rules:\n` +
  `- A NEW everyday situation or fresh example, never a textbook definition ask, never "explain ${concept}".\n` +
  `- NOT answerable yes/no; it must need 2-4 sentences of the student's own reasoning.\n` +
  `- Language: ${language} (the language the student studies in).\n` +
  `- 1 to 3 short sentences, warm and plain, ending with a question mark.\n` +
  `- Output ONLY the question text.`;

/** Generate the one confirm-check question for a practiced concept. Returns
 *  null when generation is unavailable: the caller must NOT invent a question
 *  (a made-up check could be wrong, and wrong checks poison the gold signal). */
export async function generateConfirmQuestion(
  concept: string,
  grade: string,
  board: string,
  language: string
): Promise<string | null> {
  const t0 = Date.now();
  const clean = (raw: string): string | null => {
    // Enforce the app-wide no-em/en-dash rule on model output (this path does
    // not run through ai.ts's stripInternalLabels backstop), strip stray
    // wrapping quotes, and keep only the first question if the model rambles.
    let text = (raw || "")
      .replace(/\s*—\s*/g, ", ")
      .replace(/(\d)\s*–\s*(\d)/g, "$1-$2")
      .replace(/–/g, "-")
      .trim()
      .replace(/^["'“”]+|["'“”]+$/g, "")
      .trim();
    const q = text.indexOf("?");
    if (q !== -1) text = text.slice(0, q + 1).trim();
    if (text.length < 12 || text.length > 600) return null;
    return text;
  };
  try {
    if (kimiIsAnswerBackend) {
      const out = await kimiGenerate({ system: CONFIRM_QUESTION_SYSTEM, message: confirmQuestionPrompt(concept, grade, board, language) });
      console.log(`[CONFIRM_Q] end - ${secs(t0)} (kimi, chars=${out.text.length})`);
      return clean(out.text);
    }
    if (!apiKey) return null;
    const r = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: confirmQuestionPrompt(concept, grade, board, language) }] }],
      config: { temperature: 0.7, systemInstruction: CONFIRM_QUESTION_SYSTEM },
    });
    console.log(`[CONFIRM_Q] end - ${secs(t0)} (gemini, chars=${(r.text || "").length})`);
    return clean(r.text || "");
  } catch (e: any) {
    console.warn(`[CONFIRM_Q] failed - ${secs(t0)}: ${e?.message || e}`);
    return null;
  }
}

// ---- Canonical concept ids (shadow field) ----------------------------------
//
// The model mints concept keys freehand ("photosynthesis-process" one day,
// "photosynthesis" the next), which is fine for one student's view but breaks
// cross-student aggregation. canonicalizeConcept resolves each key ONCE to a
// stable canonical id: exact slug match first, then embedding similarity
// against the global registry, else the key becomes a new canonical entry.
// Shadow-only: nothing user-facing reads it yet; every failure is swallowed.

/** Normalize a model-minted key into a canonical slug (strips class/grade
 *  tags). NFKC + unicode-aware classes so "CO₂" keeps its 2 (never colliding
 *  with "CO") and non-Latin-script keys produce a real slug instead of "". */
export function canonSlug(key: string): string {
  return (key || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-(class|grade|std)-?\d{1,2}(?=-|$)/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/** Labels originate from the model's trailer (student-influenceable text) and
 *  land in a GLOBAL registry, so they are flattened and capped before insert. */
function canonLabel(label: string | null): string | null {
  const clean = (label || "").replace(/[\u0000-\u001f\u007f`"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return clean || null;
}

const CANON_MATCH_THRESHOLD = 0.93; // conservative: a missed merge is recoverable, a false merge is not

// Only the canonical KEYS stay resident (strings, not 3072-dim vectors); the
// promise makes the cold load single-flight so concurrent calls share one
// SELECT and no call ever overwrites another's freshly-added key.
let canonKeysPromise: Promise<Set<string>> | null = null;

export async function canonicalizeConcept(
  q: Queryable,
  userId: number,
  conceptKey: string,
  label: string | null
): Promise<void> {
  try {
    const row = await getConceptMastery(q, userId, conceptKey);
    if (!row || row.canonical_key) return; // no row yet, or already resolved
    const slug = canonSlug(conceptKey);
    if (!slug) return;
    canonKeysPromise ??= canonAll(q).then((rows) => new Set(rows.map((r) => r.canonical_key)));
    const keys = await canonKeysPromise;
    let canonical = keys.has(slug) ? slug : null;
    if (!canonical) {
      // Unseen slug (rare): match by meaning against the registry, fetched
      // locally so the embeddings are never retained in memory.
      const vec = await embed(label || conceptKey.replace(/-/g, " "));
      if (vec) {
        const registry = await canonAll(q);
        let best: { key: string; s: number } | null = null;
        for (const c of registry) {
          if (!Array.isArray(c.embedding)) continue;
          const s = cosine(vec, c.embedding);
          if (s >= CANON_MATCH_THRESHOLD && (!best || s > best.s)) best = { key: c.canonical_key, s };
        }
        canonical = best?.key ?? null;
      }
      if (!canonical) {
        // A brand-new concept: the slug itself becomes the canonical id.
        await canonInsert(q, slug, canonLabel(label), vec ?? null);
        keys.add(slug);
        canonical = slug;
      }
    }
    await upsertConceptMastery(q, userId, conceptKey, { canonicalKey: canonical });
  } catch (e: any) {
    canonKeysPromise = null; // a failed cold load must not stick as a rejected promise
    console.warn(`[CANON] canonicalize failed (non-fatal): ${e?.message || e}`);
  }
}

/** Grade a student's answer to a Quick Check. A separate skeptical pass so the
 *  "did they understand" judgment is decoupled from the warm tutor that wrote
 *  the reply. Returns null if grading was unavailable (fail-open to unconfirmed,
 *  never to a false positive). */
export async function gradeStudentCheck(
  concept: string,
  check: string,
  studentAnswer: string
): Promise<CheckGrade | null> {
  const t0 = Date.now();
  const parse = (raw: string): CheckGrade | null => {
    const u = (raw || "").toUpperCase();
    if (u.includes("SKIP")) return "skip";
    if (u.includes("PARTIAL")) return "partial";
    if (u.includes("PASS")) return "pass";
    if (u.includes("FAIL")) return "fail";
    return null;
  };
  try {
    if (kimiIsAnswerBackend) {
      const out = await kimiGenerate({ system: GRADE_SYSTEM, message: gradePrompt(concept, check, studentAnswer) });
      console.log(`[CHECK_GRADE] end - ${secs(t0)} (${out.text.trim().slice(0, 16)})`);
      return parse(out.text);
    }
    if (!apiKey) return null;
    const r = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: gradePrompt(concept, check, studentAnswer) }] }],
      config: { temperature: 0.0, systemInstruction: GRADE_SYSTEM },
    });
    return parse(r.text || "");
  } catch (e: any) {
    console.warn(`[CHECK_GRADE] failed - ${secs(t0)}: ${e?.message || e}`);
    return null;
  }
}
