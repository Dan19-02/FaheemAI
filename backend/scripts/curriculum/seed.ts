/**
 * Seed the curriculum spine + corpus into the DB.
 *
 *   1. Structure (all boards): data/curriculum-structure.json ->
 *      grades, subjects, units, objectives, key_terms.  (no API calls)
 *   2. Real textbook corpus: corpus/<board>/<grade>-<subject>.jsonl ->
 *      one chapter = one unit, each chunk embedded (RETRIEVAL_DOCUMENT) and
 *      stored in corpus_chunks with unit+section provenance. The subject's
 *      grounding_level is promoted to 'textbook'.
 *
 * Runs against whatever DATABASE_URL points at (in-memory dev fallback if unset:
 * good for verifying the pipeline, not for persistence).
 *
 * Flags:
 *   --structure-only        seed structure, skip corpus/embeddings
 *   --corpus-limit N        embed at most N chunks per book (cheap verify run)
 *   --smoke "<question>"    after seeding, run a retrieval query and print the top hit
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  initDb,
  pool,
  upsertGrade,
  upsertSubject,
  upsertUnit,
  insertObjective,
  insertKeyTerm,
  insertCorpusRef,
  insertCorpusChunk,
  corpusChunksForUnit,
  getSubject,
  setSubjectGrounding,
} from "../../src/db.js";
import { embed } from "../../src/provider.js";
import { cosine } from "../../src/knowledge.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, "..", "..");
const STRUCT = path.join(BACKEND, "data", "curriculum-structure.json");
const CORPUS_DIR = path.join(BACKEND, "corpus");

const args = process.argv.slice(2);
const structureOnly = args.includes("--structure-only");
const corpusLimit = (() => {
  const i = args.indexOf("--corpus-limit");
  return i >= 0 ? Number(args[i + 1]) : Infinity;
})();
const smokeQuery = (() => {
  const i = args.indexOf("--smoke");
  return i >= 0 ? args[i + 1] : null;
})();

interface Structure {
  grades: { gradeId: string; board: string; labelEn: string; indiaEquiv: string }[];
  subjects: { subjectId: string; board: string; subjectSlug: string; nameEn: string; nameAr: string; accuracyType: string; groundingLevel: string }[];
  units: { unitId: string; board: string; subjectId: string; gradeId: string; seq: number; titleEn: string; titleAr: string }[];
  objectives: { id: string; unitId: string; seq: number; textEn: string; textAr: string }[];
  keyTerms: { id: string; unitId: string; termEn: string; termAr: string }[];
}

async function seedStructure(): Promise<void> {
  const s: Structure = JSON.parse(fs.readFileSync(STRUCT, "utf-8"));
  for (const g of s.grades) {
    await upsertGrade(pool, { gradeId: g.gradeId, board: g.board, labelAr: "", labelEn: g.labelEn, indiaEquiv: g.indiaEquiv });
  }
  for (const sub of s.subjects) {
    await upsertSubject(pool, {
      subjectId: sub.subjectId,
      board: sub.board,
      nameAr: sub.nameAr || "",
      nameEn: sub.nameEn,
      accuracyType: sub.accuracyType,
      groundingLevel: sub.groundingLevel,
    });
  }
  for (const u of s.units) {
    await upsertUnit(pool, {
      unitId: u.unitId,
      board: u.board,
      subjectId: u.subjectId,
      gradeId: u.gradeId,
      seq: u.seq,
      titleAr: u.titleAr || "",
      titleEn: u.titleEn,
    });
  }
  for (const o of s.objectives) {
    await insertObjective(pool, { id: o.id, unitId: o.unitId, seq: o.seq, textAr: o.textAr || "", textEn: o.textEn });
  }
  for (const t of s.keyTerms) {
    await insertKeyTerm(pool, { id: t.id, unitId: t.unitId, termAr: t.termAr || "", termEn: t.termEn });
  }
  console.log(`[seed] structure: ${s.grades.length} grades, ${s.subjects.length} subjects, ${s.units.length} units, ${s.objectives.length} objectives, ${s.keyTerms.length} key terms`);
}

interface CorpusRecord {
  board: string;
  gradeEquiv: string;
  subjectSlug: string;
  subjectName: string;
  chapterNum: number;
  chapterTitle: string;
  sectionLabel: string;
  chunkIndex: number;
  text: string;
  sourceUri: string;
}

async function seedCorpusFile(file: string): Promise<{ chunks: number; embedded: number; unit: string }> {
  const recs: CorpusRecord[] = fs
    .readFileSync(file, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  if (!recs.length) return { chunks: 0, embedded: 0, unit: "" };

  const { board, gradeEquiv, subjectSlug, subjectName } = recs[0];
  const subjectId = `${board}.${subjectSlug}`;
  const gradeId = `${board}.g${gradeEquiv}`;

  // Defensive: make sure the grade/subject exist (FK) even if structure lacked them.
  await upsertGrade(pool, { gradeId, board, labelAr: "", labelEn: `Grade ${gradeEquiv}`, indiaEquiv: gradeEquiv });
  if (!(await getSubject(pool, subjectId))) {
    await upsertSubject(pool, { subjectId, board, nameAr: "", nameEn: subjectName, accuracyType: "A", groundingLevel: "textbook" });
  }

  // Group chunks by chapter; one chapter = one unit.
  const byChapter = new Map<number, CorpusRecord[]>();
  for (const r of recs) {
    if (!byChapter.has(r.chapterNum)) byChapter.set(r.chapterNum, []);
    byChapter.get(r.chapterNum)!.push(r);
  }

  let embedded = 0;
  let total = 0;
  let firstUnit = "";
  for (const [chapterNum, chunks] of [...byChapter.entries()].sort((a, b) => a[0] - b[0])) {
    const unitId = `${board}.g${gradeEquiv}.${subjectSlug}.ch${chapterNum}`;
    if (!firstUnit) firstUnit = unitId;
    const title = chunks[0].chapterTitle;
    const sectionLabel = chunks[0].sectionLabel;
    await upsertUnit(pool, {
      unitId,
      board,
      subjectId,
      gradeId,
      seq: chapterNum,
      titleAr: "",
      titleEn: title,
      sourceTextbook: "NCERT",
      sourceEdition: "2024-25",
    });
    const refId = `${unitId}.r1`;
    await insertCorpusRef(pool, { refId, unitId, sectionLabel, sourceUri: chunks[0].sourceUri });

    for (const c of chunks) {
      if (total >= corpusLimit) break;
      total++;
      const vec = await embed(c.text, "RETRIEVAL_DOCUMENT");
      if (vec) embedded++;
      await insertCorpusChunk(pool, {
        chunkId: `${unitId}.c${c.chunkIndex}`,
        unitId,
        refId,
        sectionLabel,
        contentDisplay: c.text,
        contentEmbed: c.text,
        embedding: vec,
        tokenCount: c.text.split(/\s+/).length,
      });
      if (total % 25 === 0) console.log(`  [corpus] ${subjectId} ${embedded}/${total} embedded...`);
    }
    if (total >= corpusLimit) break;
  }
  await setSubjectGrounding(pool, subjectId, "textbook");
  return { chunks: total, embedded, unit: firstUnit };
}

async function seedCorpus(): Promise<string> {
  if (!fs.existsSync(CORPUS_DIR)) {
    console.log("[seed] no corpus/ dir yet (run source_ncert.py first); skipping corpus.");
    return "";
  }
  let firstUnit = "";
  for (const board of fs.readdirSync(CORPUS_DIR)) {
    const dir = path.join(CORPUS_DIR, board);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
      const res = await seedCorpusFile(path.join(dir, f));
      if (!firstUnit) firstUnit = res.unit;
      console.log(`[seed] corpus ${board}/${f}: ${res.embedded}/${res.chunks} chunks embedded -> unit ${res.unit}`);
    }
  }
  return firstUnit;
}

/** Prove grounding retrieval works: embed the query, rank the unit's chunks. */
async function smoke(unitId: string, question: string): Promise<void> {
  const qv = await embed(question, "RETRIEVAL_QUERY");
  if (!qv) {
    console.log("[smoke] no query embedding (API key?); skipping retrieval test.");
    return;
  }
  const chunks = await corpusChunksForUnit(pool, unitId);
  const scored = chunks
    .filter((c) => Array.isArray(c.embedding))
    .map((c) => ({ c, s: cosine(qv, c.embedding as number[]) }))
    .sort((a, b) => b.s - a.s);
  console.log(`\n[smoke] unit=${unitId}  q="${question}"  (${chunks.length} chunks)`);
  for (const { c, s } of scored.slice(0, 2)) {
    console.log(`  cos=${s.toFixed(3)} [${c.sectionLabel}] ${c.contentDisplay.slice(0, 180).replace(/\s+/g, " ")}...`);
  }
}

async function main() {
  await initDb();
  await seedStructure();
  let firstUnit = "";
  if (!structureOnly) firstUnit = await seedCorpus();
  if (smokeQuery && firstUnit) await smoke(firstUnit, smokeQuery);
  console.log("[seed] done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[seed] failed:", e);
  process.exit(1);
});
