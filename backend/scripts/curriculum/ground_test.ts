/** Verify server-side grounding: subject/unit resolved from board+grade+question. */
import "dotenv/config";
import { initDb } from "../../src/db.js";
import { embed } from "../../src/provider.js";
import { groundQuery } from "../../src/curriculumGrounding.js";

async function show(board: string, grade: string, q: string) {
  const qv = await embed(q, "RETRIEVAL_QUERY");
  const g = await groundQuery(board, grade, qv, q);
  console.log(`\n[${board} / ${grade}] "${q}"`);
  console.log(`  grounded=${!!g.source} outOfSyllabus=${g.outOfSyllabus} level=${g.level} score=${g.groundedness.toFixed(3)}`);
  if (g.source) console.log(`  -> resolved unit: ${g.source.unitTitle} · ${g.source.section}`);
}

async function main() {
  await initDb();
  await show("CBSE", "Grade 10", "how do you balance a chemical equation?");
  await show("CBSE", "Grade 10", "what is the quadratic formula?");
  await show("Bahrain MoE", "Grade 10", "how do you balance a chemical equation?");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
