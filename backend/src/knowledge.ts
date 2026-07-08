/**
 * Embeddings + topic gating + deep-verify.
 *
 * - embed(): Gemini embeddings with a caller-chosen taskType. Retrieval is
 *   ASYMMETRIC (RETRIEVAL_QUERY against a RETRIEVAL_DOCUMENT corpus), while the
 *   paraphrase semantic cache compares like with like (SEMANTIC_SIMILARITY,
 *   the default here because every stored cache vector was built with it).
 * - topicTokens()/topicCompatible(): gate the semantic cache so it never
 *   reuses an answer across unrelated topics (e.g. osmosis vs diffusion).
 *   Tokenization covers English and Arabic.
 * - verifyAnswer(): optional deep-verify examiner pass.
 *
 * All Gemini calls here go through resilience.callExternal (timeout + retry +
 * the shared "gemini" circuit breaker), so a stalled provider degrades fast
 * instead of holding requests.
 */
import { ai, apiKey } from "./gemini.js";
import { callExternal } from "./resilience.js";

// gemini-embedding-001 is the live embeddings model. text-embedding-004 was
// retired from the API (404s as of 2026-07-02) and is no longer tried.
const EMBED_MODELS = ["gemini-embedding-001"];
let chosenEmbedModel: string | null = null;

const EMBED_TIMEOUT_MS = () => Math.max(1_000, Number(process.env.EMBED_TIMEOUT_MS) || 8_000);
const VERIFY_TIMEOUT_MS = () => Math.max(5_000, Number(process.env.VERIFY_TIMEOUT_MS) || 45_000);

/** Seconds elapsed since t0, formatted for the latency trace logs. */
export const secs = (t0: number) => ((Date.now() - t0) / 1000).toFixed(1) + "s";

export type EmbedTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY";

export async function embed(text: string, taskType: EmbedTaskType = "SEMANTIC_SIMILARITY"): Promise<number[] | null> {
  if (!apiKey || !text?.trim()) return null;
  const models = chosenEmbedModel ? [chosenEmbedModel] : EMBED_MODELS;
  const embedT0 = Date.now();
  for (const model of models) {
    // Try with taskType first; fall back to no-config if the model rejects it.
    for (const cfg of [{ taskType }, undefined] as const) {
      const t0 = Date.now();
      console.log(`[GEMINI_EMBED] start (model=${model}, cfg=${cfg ? taskType : "plain"})`);
      try {
        const r: any = await callExternal(
          () => ai.models.embedContent({ model, contents: text, ...(cfg ? { config: cfg } : {}) }),
          { label: `gemini.embed(${model})`, dependency: "gemini", timeoutMs: EMBED_TIMEOUT_MS(), retries: 1 }
        );
        const values: number[] | undefined = r?.embeddings?.[0]?.values || r?.embedding?.values;
        if (Array.isArray(values) && values.length) {
          chosenEmbedModel = model;
          console.log(`[GEMINI_EMBED] end - ${secs(t0)} (model=${model}, dims=${values.length})`);
          return values;
        }
        console.warn(`[GEMINI_EMBED] empty - ${secs(t0)} (model=${model}), trying next`);
      } catch (e: any) {
        // Includes CircuitOpenError when the gemini breaker is open: the
        // caller degrades (no semantic cache / no grounding) rather than wait.
        console.warn(`[GEMINI_EMBED] failed - ${secs(t0)} (model=${model}, cfg=${cfg ? taskType : "plain"}): ${e?.message || e}`);
      }
    }
  }
  console.warn(`[GEMINI_EMBED] gave up - ${secs(embedT0)} (all models/configs failed)`);
  return null;
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
  "a an the is are was were be of for to from in into on at with and or but what whats which who whom how why when where do does did explain define describe tell me about please give show find calculate solve simple simply detail short brief words word can you i my mean meaning concept topic kya hai hota hain ka ki ke ko ek mujhe batao samjhao".split(/\s+/)
);

// Arabic question/filler words that carry no topic (stored in the same
// normalized form normalizeArabic produces). Kept small on purpose; the
// subset gate in topicCompatible does the real discrimination work.
const ARABIC_STOPWORDS = new Set(["ما", "هو", "هي", "من", "في", "على", "لماذا", "كيف", "اشرح", "لي", "عن"]);

/**
 * Normalize Arabic for matching: strip diacritics (harakat) and tatweel,
 * unify the alef variants, and map ta marbuta to ha, so surface variants of
 * the same word ("مقدّمة" / "مقدمه") produce the same token.
 */
function normalizeArabic(s: string): string {
  return s
    .replace(/[ً-ْٰ]/g, "") // harakat + dagger alef
    .replace(/ـ/g, "") // tatweel
    .replace(/[آأإٱ]/g, "ا") // alef variants -> plain alef
    .replace(/ة/g, "ه"); // ta marbuta -> ha
}

/** Significant content tokens of a question (used to topic-gate the cache).
 *  Handles English (and Latin-script) plus Arabic; anything else is dropped,
 *  which makes the gate conservative (no tokens = only same-shape reuse). */
export function topicTokens(message: string): Set<string> {
  const cleaned = normalizeArabic((message || "").toLowerCase())
    // Arabic punctuation lives INSIDE the U+0600-U+06FF block the next replace
    // keeps, so it is stripped explicitly (comma, semicolon, question mark,
    // percent, decimal/thousands separators, full stop).
    .replace(/[،؛؟٪٫٬۔]/g, " ")
    .replace(/[^a-z0-9؀-ۿ\s]/g, " ");
  const out = new Set<string>();
  for (const w of cleaned.split(/\s+/)) {
    if (!w) continue;
    if (/[؀-ۿ]/.test(w)) {
      // Arabic content words are commonly two letters after normalization.
      if (w.length >= 2 && !ARABIC_STOPWORDS.has(w)) out.add(w);
    } else if (w.length >= 3 && !STOPWORDS.has(w)) {
      out.add(w);
    }
  }
  return out;
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

export interface VerifyResult {
  text: string;
  /** True only when the examiner pass actually ran. False means the draft is
   *  returned unverified (missing key or examiner call failed), and the caller
   *  must surface that honestly rather than implying the answer was checked. */
  verified: boolean;
}

/** Optional deep-verify: a meticulous examiner pass that corrects errors. */
export async function verifyAnswer(question: string, answer: string): Promise<VerifyResult> {
  if (!apiKey) {
    console.warn("[Verify] Deep-check unavailable: GEMINI_API_KEY missing, returning the answer unverified.");
    return { text: answer, verified: false };
  }
  const t0 = Date.now();
  console.log(`[GEMINI_VERIFY] start (draft chars=${answer.length})`);
  try {
    // No retries: the examiner sits on the response path after a full draft,
    // and a failed pass degrades honestly to "unverified" instead of stacking
    // a second long call on top.
    const r = await callExternal(
      () =>
        ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [
            {
              role: "user",
              parts: [
                {
                  text:
                    `Student's question:\n${question}\n\nDraft answer to review:\n${answer}\n\n` +
                    `Carefully check it for: (1) any factual error, wrong formula, or calculation mistake; ` +
                    `(2) any FALSE ABSOLUTE, a rule of thumb stated as "always" or "never" (in any language) that has real exceptions, which you must soften to "usually" or "in most cases" WITHOUT weakening a genuinely universal law; ` +
                    `(3) the MAIN worked solution left with only a method but no final numerical result, which you should finish. ` +
                    `CRITICAL: preserve exactly as-is the closing self-check question the tutor poses to the student. NEVER answer, solve, hint at, or complete that closing question; it must stay open and unanswered. Item (3) applies only to the main solution, never to the closing check. ` +
                    `If you find a real issue in (1) to (3), return a corrected version in the SAME format, language, and warm tone. ` +
                    `If it is fully correct, return it unchanged. Output ONLY the final answer.`,
                },
              ],
            },
          ],
          config: {
            temperature: 0.1,
            systemInstruction:
              "You are a meticulous subject examiner for secondary-school material across the curricula taught in Bahrain: the Bahrain MoE national curriculum, CBSE, and Cambridge. You fix factual and mathematical errors, soften false absolutes that have real exceptions, and finish the main worked solution if it stops short of its numerical result, all while preserving the warm tone, the student's language (Arabic or English), and any section/notebook formatting. You NEVER answer or complete the closing self-check question the tutor leaves for the student; that always stays open. Output only the (corrected) answer.",
          },
        }),
      { label: "gemini.verify", dependency: "gemini", timeoutMs: VERIFY_TIMEOUT_MS(), retries: 0 }
    );
    // An empty examiner response means nothing was actually checked.
    if (!r.text) {
      console.warn(`[GEMINI_VERIFY] empty - ${secs(t0)}, treating the answer as unverified.`);
      return { text: answer, verified: false };
    }
    console.log(`[GEMINI_VERIFY] end - ${secs(t0)} (chars=${r.text.length})`);
    return { text: r.text, verified: true };
  } catch (e: any) {
    // CircuitOpenError lands here too: with the provider down, the honest
    // move is to serve the draft marked unverified, not to block the answer.
    console.warn(`[GEMINI_VERIFY] failed - ${secs(t0)}, returning the answer unverified: ${e?.message || e}`);
    return { text: answer, verified: false };
  }
}
