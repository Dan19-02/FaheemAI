/**
 * Bahrain curriculum grounding for the Clarify chat flow.
 *
 * The student sets only board + grade (Clarify's profile) and just asks — this
 * resolves SUBJECT and UNIT server-side by retrieving the best-matching unit's
 * textbook content across the whole board+grade corpus. It plugs into the same
 * `referenceContext` slot Clarify already feeds to buildSystemInstruction, so
 * the rest of the flow (cache, streaming, deep-check, notebook) is untouched.
 *
 * Honesty: if nothing in the grade's textbooks matches, it returns no reference
 * and flags out-of-syllabus rather than inventing a curriculum source. Boards/
 * grades with no textbook corpus (syllabus-only) simply return no reference, and
 * Clarify answers as usual (no false "from your curriculum" claim).
 */
import { pool, corpusChunksForBoardGrade } from "./db.js";
import { cosine } from "./knowledge.js";

const RETRIEVAL_GATE = () => Number(process.env.RETRIEVAL_GATE) || 0.62;
const TOP_K = 4;
const MAX_CHUNK_CHARS = 900;

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
    chunks = await corpusChunksForBoardGrade(pool, bk, gradeId);
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
    .map((x) => `[${x.c.unitTitle} · ${x.c.sectionLabel}] ${x.c.contentDisplay.slice(0, MAX_CHUNK_CHARS)}`)
    .join("\n\n");
  return {
    reference,
    source: { unitTitle: top.c.unitTitle, section: top.c.sectionLabel, unitId: top.c.unitId },
    groundedness: top.s,
    outOfSyllabus: false,
    level: "textbook",
  };
}
