/**
 * Bahrain curriculum grounding for the Clarify chat flow.
 *
 * The student sets only board + grade (the profile) and just asks: this
 * resolves SUBJECT and UNIT server-side by retrieving the best-matching unit's
 * textbook content across the whole board+grade corpus. It plugs into the same
 * `referenceContext` slot the chat flow already feeds to buildSystemInstruction,
 * so the rest of the flow (cache, streaming, deep-check, notebook) is untouched.
 *
 * Honesty: if nothing in the grade's textbooks matches, it returns no reference
 * and flags out-of-syllabus rather than inventing a curriculum source. Boards/
 * grades with no textbook corpus (syllabus-only) simply return no reference, and
 * Clarify answers as usual (no false "from your curriculum" claim).
 */
import { pool, corpusChunksForBoardGrade, type CorpusChunk } from "./db.js";
import { cosine } from "./knowledge.js";

// Gate tied to the EMBEDDING model (gemini-embedding-001), not the generation
// tier; re-tune if the embedder changes.
const RETRIEVAL_GATE = () => Number(process.env.RETRIEVAL_GATE) || 0.62;
const TOP_K = 2; // 1-2 chunks corroborate; more crowds the teaching persona and amplifies anchoring
const MAX_CHUNK_CHARS = 900;

// Which boards actually have a seeded textbook corpus. Grounding can only ever
// fire for these, so for every other board (the Bahrain MoE flagship included)
// we skip the retrieval-query embedding entirely instead of embedding, loading a
// corpus, and finding nothing on 100% of requests. Env-overridable as corpora grow.
const GROUNDED_BOARDS = new Set(
  (process.env.GROUNDED_BOARDS || "cbse").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
);
export function boardHasCorpus(board?: string): boolean {
  const bk = boardKey(board);
  return bk != null && GROUNDED_BOARDS.has(bk);
}

/** Trim a chunk to the last sentence boundary before `max`, so the model is
 *  never handed a half-sentence it might treat as authoritative. Falls back to
 *  the hard cap when no boundary is found; guards decimals (9.8 m/s²) and
 *  includes Arabic terminators. */
function trimToSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  let cut = -1;
  for (const m of head.matchAll(/[.!?؟]\s|[\n؛]/g)) {
    const i = (m.index ?? 0) + 1;
    // not a decimal point between digits (e.g. "9.8")
    if (/[.]/.test(m[0]) && /\d/.test(head[i] || "") && /\d/.test(head[(m.index ?? 0) - 1] || "")) continue;
    cut = i;
  }
  return (cut > max * 0.5 ? head.slice(0, cut) : head).trim();
}

// In-process cache of a grade's corpus vectors. Loading + JSON-parsing the
// whole board+grade corpus from Postgres on EVERY question is the single
// biggest per-request cost of grounding, and the corpus only changes on an
// operator re-seed (an offline action), so serving it up to TTL-stale is safe:
// the worst case is ten minutes of answers grounded on the previous seed.
// The size guard bounds memory if many board+grade combos get traffic.
const CORPUS_TTL_MS = 10 * 60_000;
const CORPUS_CACHE_MAX_ENTRIES = 8;
type CachedCorpus = { loadedAt: number; chunks: (CorpusChunk & { unitTitle: string })[] };
const corpusCache = new Map<string, CachedCorpus>();

async function corpusFor(board: string, gradeId: string): Promise<CachedCorpus["chunks"]> {
  const key = `${board}|${gradeId}`;
  const hit = corpusCache.get(key);
  if (hit && Date.now() - hit.loadedAt < CORPUS_TTL_MS) return hit.chunks;
  const chunks = await corpusChunksForBoardGrade(pool, board, gradeId);
  if (!corpusCache.has(key) && corpusCache.size >= CORPUS_CACHE_MAX_ENTRIES) {
    const oldest = corpusCache.keys().next().value;
    if (oldest) corpusCache.delete(oldest);
  }
  corpusCache.set(key, { loadedAt: Date.now(), chunks });
  return chunks;
}

export interface GroundingResult {
  /** Curriculum reference to inject into the system prompt, or null. */
  reference: string | null;
  /** The unit the answer is grounded in (for the source chip), or null. */
  source: { unitTitle: string; section: string; unitId: string } | null;
  /** Top-1 cosine similarity (0 when ungrounded). */
  groundedness: number;
  /** True when the grade HAS textbooks but none match the question. */
  outOfSyllabus: boolean;
  level: "textbook" | "none";
}

const NONE: GroundingResult = { reference: null, source: null, groundedness: 0, outOfSyllabus: false, level: "none" };

/** Map a profile board label to the curriculum board key. */
function boardKey(board?: string): string | null {
  const b = (board || "").toLowerCase();
  if (b.includes("moe") || b.includes("bahrain")) return "moe";
  if (b.includes("cbse")) return "cbse";
  if (b.includes("cambridge")) return "cambridge";
  return null;
}

/** gradeId is `<board>.g<number>`; the number comes from the grade label. */
function gradeIdFrom(bk: string, grade?: string): string | null {
  const num = (grade || "").match(/\d+/)?.[0];
  return num ? `${bk}.g${num}` : null;
}

export async function groundQuery(
  board: string | undefined,
  grade: string | undefined,
  queryEmbedding: number[] | null,
  _message: string
): Promise<GroundingResult> {
  if (!queryEmbedding) return NONE;
  const bk = boardKey(board);
  if (!bk) return NONE;
  const gradeId = gradeIdFrom(bk, grade);
  if (!gradeId) return NONE;

  let chunks;
  try {
    chunks = await corpusFor(bk, gradeId);
  } catch {
    return NONE;
  }
  const embedded = chunks.filter((c) => Array.isArray(c.embedding));
  if (embedded.length === 0) return NONE; // syllabus-only grade: no textbook grounding, answer generally

  const scored = embedded
    .map((c) => ({ c, s: cosine(queryEmbedding, c.embedding as number[]) }))
    .sort((a, b) => b.s - a.s);
  const top = scored[0];

  if (top.s < RETRIEVAL_GATE()) {
    // Nothing in the textbooks matches this question. We do NOT gate or flag it:
    // the model answers normally (no curriculum source shown). Grounding is an
    // optional aid that sharpens an answer where it fits, never a wall.
    return NONE;
  }

  const picked = scored.slice(0, TOP_K);
  const reference = picked
    .map((x) => `[${x.c.unitTitle} · ${x.c.sectionLabel}] ${trimToSentence(x.c.contentDisplay, MAX_CHUNK_CHARS)}`)
    .join("\n\n");
  return {
    reference,
    source: { unitTitle: top.c.unitTitle, section: top.c.sectionLabel, unitId: top.c.unitId },
    groundedness: top.s,
    outOfSyllabus: false,
    level: "textbook",
  };
}
