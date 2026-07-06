/**
 * Phase 3 end-to-end test: prove the accuracy engine works on real corpus.
 *   1. Unit-test the deterministic verifier (verify.ts) — no API.
 *   2. Seed structure + NCERT Class-10-Science chapter 1 (with embeddings).
 *   3. askTutor on a GROUNDED question (Arabic) -> grounded, sourced, verified.
 *   4. askTutor on an OFF-SYLLABUS question -> flagged, not answered.
 *
 * Needs GEMINI_API_KEY in .env (embeddings + one generation). Run:
 *   npx tsx scripts/curriculum/ask_test.ts
 */
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { initDb } from "../../src/db.js";
import { seedStructure, seedCorpusFile } from "./seed.js";
import { askTutor } from "../../src/tutor.js";
import { checkAnswerClaim, safeEval } from "../../src/verify.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, "..", "..");

function line(s = "") { console.log(s); }
function ok(cond: boolean, label: string) { console.log(`  ${cond ? "✓" : "✗"} ${label}`); if (!cond) process.exitCode = 1; }

async function main() {
  line("== 1. deterministic verifier (no API) ==");
  ok(safeEval("2 + 3 * 4") === 14, "2 + 3 * 4 = 14");
  ok(safeEval("-2^2") === -4, "-2^2 = -4 (exponent binds tighter than unary minus)");
  ok(safeEval("sqrt(2*g*h)", { g: 9.8, h: 19.6 })! .toFixed(2) === "19.60", "sqrt(2*g*h) with g=9.8,h=19.6 ≈ 19.6");
  const good = checkAnswerClaim({ checkable: true, finalValue: "19.6", expression: "sqrt(2*g*h)", givens: [{ name: "g", value: "9.8" }, { name: "h", value: "19.6" }] });
  ok(good.verification === "verified", `correct claim -> verified (${good.detail})`);
  const bad = checkAnswerClaim({ checkable: true, finalValue: "25", expression: "sqrt(2*g*h)", givens: [{ name: "g", value: "9.8" }, { name: "h", value: "19.6" }] });
  ok(bad.verification === "failed", `wrong claim -> failed (${bad.detail})`);
  const na = checkAnswerClaim({ checkable: false });
  ok(na.verification === "not_applicable", "non-numeric claim -> not_applicable");

  line("\n== 2. seed structure + NCERT Class-10-Science ch.1 (live embeddings) ==");
  await initDb();
  await seedStructure();
  const res = await seedCorpusFile(path.join(BACKEND, "corpus", "cbse", "10-science.jsonl"), 30);
  line(`  seeded ${res.embedded}/${res.chunks} chunks -> unit ${res.unit}`);
  const unitId = res.unit; // cbse.g10.science.ch1
  ok(!!unitId, "chapter unit created with corpus");

  line("\n== 3. GROUNDED question (Arabic), unit = ch.1 ==");
  const grounded = await askTutor({
    board: "cbse", gradeId: "cbse.g10", subjectId: "cbse.science", unitId,
    question: "How do we balance a chemical equation, and why must it be balanced?",
    language: "ar",
  });
  line(`  confidence=${grounded.confidence}  verification=${grounded.verification}  outOfSyllabus=${grounded.outOfSyllabus}`);
  line(`  source: ${grounded.grounding.unitTitleEn} · ${grounded.grounding.section} (groundedness=${grounded.grounding.groundednessScore.toFixed(3)})`);
  line(`  answer (Arabic, first 220 chars): ${grounded.text.slice(0, 220).replace(/\s+/g, " ")}...`);
  ok(!grounded.outOfSyllabus, "grounded question was answered (not flagged out-of-syllabus)");
  ok(grounded.grounding.groundednessScore >= 0.62, "groundedness cleared the gate");
  ok(/[؀-ۿ]/.test(grounded.text), "answer is in Arabic script");

  line("\n== 4. OFF-SYLLABUS question on the same unit ==");
  const off = await askTutor({
    board: "cbse", gradeId: "cbse.g10", subjectId: "cbse.science", unitId,
    question: "Explain the human digestive system and the role of the small intestine.",
    language: "en",
  });
  line(`  confidence=${off.confidence}  outOfSyllabus=${off.outOfSyllabus}`);
  line(`  response: ${off.text.slice(0, 160)}`);
  ok(off.outOfSyllabus === true, "digestion question flagged OUT-OF-SYLLABUS for the chemical-reactions unit");

  line("\n== Phase 3 engine test complete ==");
  process.exit(process.exitCode || 0);
}

main().catch((e) => { console.error("test failed:", e); process.exit(1); });
