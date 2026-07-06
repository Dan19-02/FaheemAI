/**
 * FR1 — student context selection, served from the curriculum spine.
 * Read-only, unauthenticated for the pilot (no student data here, just the
 * public curriculum tree). Cascades: board -> grade -> subject -> unit.
 */
import express from "express";
import { pool, listGrades, listSubjects, listUnits, corpusChunkCountForUnit } from "./db.js";

const BOARD_LABELS: Record<string, string> = {
  moe: "Bahrain MoE (National)",
  cbse: "CBSE",
  cambridge: "Cambridge (British)",
};

export const curriculumRouter = express.Router();

/** Distinct boards that actually have subjects seeded. */
curriculumRouter.get("/curriculum/boards", async (_req, res) => {
  try {
    const subjects = await listSubjects(pool);
    const seen = new Set<string>();
    const boards = subjects
      .map((s) => s.board)
      .filter((b) => (seen.has(b) ? false : (seen.add(b), true)))
      .map((b) => ({ board: b, label: BOARD_LABELS[b] || b }));
    res.json({ boards });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});

curriculumRouter.get("/curriculum/grades", async (req, res) => {
  const board = String(req.query.board || "");
  if (!board) return res.status(400).json({ error: "board is required" });
  try {
    const grades = (await listGrades(pool, board)).map((g) => ({ gradeId: g.gradeId, labelEn: g.labelEn, indiaEquiv: g.indiaEquiv }));
    res.json({ grades });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});

curriculumRouter.get("/curriculum/subjects", async (req, res) => {
  const board = String(req.query.board || "");
  if (!board) return res.status(400).json({ error: "board is required" });
  try {
    const subjects = (await listSubjects(pool, board)).map((s) => ({
      subjectId: s.subjectId,
      nameEn: s.nameEn,
      nameAr: s.nameAr,
      accuracyType: s.accuracyType,
      groundingLevel: s.groundingLevel,
    }));
    res.json({ subjects });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});

curriculumRouter.get("/curriculum/units", async (req, res) => {
  const subjectId = String(req.query.subjectId || "");
  const gradeId = String(req.query.gradeId || "");
  if (!subjectId || !gradeId) return res.status(400).json({ error: "subjectId and gradeId are required" });
  try {
    const units = await listUnits(pool, subjectId, gradeId);
    const withCorpus = await Promise.all(
      units.map(async (u) => ({
        unitId: u.unitId,
        seq: u.seq,
        titleEn: u.titleEn,
        titleAr: u.titleAr,
        hasCorpus: (await corpusChunkCountForUnit(pool, u.unitId)) > 0,
      }))
    );
    res.json({ units: withCorpus });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});
