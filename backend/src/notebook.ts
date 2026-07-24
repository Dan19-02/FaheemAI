/**
 * Pre-exam notebook (decided 2026-07-03).
 *
 * Students select the exact lines of an answer that made something click and
 * save them. The AI files each point under a subject and chapter automatically
 * (the student never categorises anything), and "Faheem notes" turns a
 * chapter's saved points into one structured, marks-style revision sheet.
 *
 * Access: SAVING is open to every signed-in account, so value accumulates from
 * day one. VIEWING the shelf and generating Faheem notes needs an active
 * Regular or Unlimited pass (hasNotebookAccess); everyone else gets a calm
 * locked summary with their saved-point count. A lapsed pass read-locks the
 * notebook, it never deletes anything.
 *
 * Models: Gemini Flash for the tiny classification tool-call (fast, cheap,
 * runs async after save) and for the Faheem notes generation. (The old
 * MiniMax notes path was retired with the rest of that brain.)
 */
import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import { requireAuth } from "./auth.js";
import { ai, apiKey } from "./gemini.js";
import { ThinkingLevel } from "@google/genai";
import { rateLimit } from "./ai.js";
import {
  pool,
  getUserById,
  notebookInsert,
  notebookSetClassification,
  notebookCount,
  notebookLabels,
  notebookTree,
  notebookEntriesFor,
  notebookChapterStats,
  notebookDeleteEntry,
  noteGet,
  noteUpsert,
} from "./db.js";
import { getEntitlement, hasNotebookAccess } from "./subscription.js";

const MAX_ENTRY_CHARS = 4000;
const MAX_ENTRIES_PER_USER = 2000;

// Cost ceilings for the notes prompt: a chapter can legally hold up to 2000
// points of 4000 chars (8MB), which must never reach a model verbatim. The
// most recent points win (they reflect the student's current understanding).
const NOTES_MAX_POINTS = 150;
const NOTES_PER_POINT_CHARS = 1200;
const NOTES_TOTAL_CHARS = 90_000;

// Classification is a real (cheap) model call on a FREE action, so it gets a
// generous daily ceiling per account; beyond it, points simply stay in
// General/Unsorted (visible, never lost). Without this, a scripted account
// looping save/delete could burn unbounded classifier calls.
const CLASSIFY_PER_DAY = 150;
const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

// Canonical subjects: the classifier must pick from this list so the shelf
// never fragments into "Physics" / "physics" / "Class 11 Physics".
const SUBJECTS = [
  "Physics",
  "Chemistry",
  "Biology",
  "Mathematics",
  "English",
  "History",
  "Geography",
  "Computer Science",
  "Economics",
  "Accounting",
  "Business Studies",
  "General",
];

function newEntryId(): string {
  return `nb-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

/** Normalise a classifier subject onto the canonical list (else General). */
function canonicalSubject(raw: string): string {
  const cleaned = (raw || "").trim().toLowerCase();
  return SUBJECTS.find((s) => s.toLowerCase() === cleaned) || "General";
}

/** Chapter labels stay short, single-line, and reuse the student's existing ones. */
function cleanChapter(raw: string, existing: { subject: string; chapter: string }[], subject: string): string {
  let chapter = (raw || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!chapter) return "Unsorted";
  const match = existing.find(
    (e) => e.subject === subject && e.chapter.toLowerCase() === chapter.toLowerCase()
  );
  return match ? match.chapter : chapter;
}

/**
 * File one saved point under subject + chapter. Runs asynchronously AFTER the
 * save responds (a student on a slow network must never wait on this); any
 * failure just leaves the point under General/Unsorted, which the shelf shows
 * normally. Gemini Flash, strict JSON, temperature 0.
 */
async function classifyEntry(
  userId: number,
  entryId: string,
  question: string,
  text: string,
  board: string,
  grade: string
): Promise<void> {
  try {
    if (!apiKey) return;
    if (!rateLimit(`${userId}:nb-classify`, CLASSIFY_PER_DAY, DAY_WINDOW_MS)) {
      console.warn(`[NOTEBOOK_CLASSIFY] daily ceiling reached for user ${userId}; point stays in General/Unsorted.`);
      return;
    }
    const existing = await notebookLabels(pool, userId);
    const existingList = existing
      .filter((e) => e.chapter !== "Unsorted")
      .map((e) => `${e.subject} / ${e.chapter}`)
      .slice(0, 60)
      .join("\n");

    const prompt = `You are a librarian for a student's revision notebook (curriculum: ${board || "General"}, level: ${grade || "school"}).
File this saved study snippet under exactly one subject and one chapter.

RULES:
- subject MUST be one of: ${SUBJECTS.join(", ")}
- chapter: the standard textbook chapter name for this curriculum and level, short (under 6 words), in English. If one of the student's existing chapters below already fits, REUSE its exact spelling instead of inventing a variant.
- Reply with ONLY a JSON object: {"subject":"...","chapter":"..."}

STUDENT'S EXISTING CHAPTERS:
${existingList || "(none yet)"}

THE QUESTION THAT WAS ASKED:
${(question || "").slice(0, 500)}

THE SAVED SNIPPET:
${text.slice(0, 1500)}`;

    const t0 = Date.now();
    const resp: any = await Promise.race([
      ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { temperature: 0, responseMimeType: "application/json" },
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("classify timeout")), 20_000)),
    ]);
    const parsed = JSON.parse((resp.text || "{}").trim());
    const subject = canonicalSubject(parsed.subject);
    const chapter = cleanChapter(parsed.chapter, existing, subject);
    await notebookSetClassification(pool, userId, entryId, subject, chapter);
    console.log(`[NOTEBOOK_CLASSIFY] end - ${((Date.now() - t0) / 1000).toFixed(1)}s (${subject} / ${chapter})`);
  } catch (e: any) {
    // Point stays under General/Unsorted: visible, usable, never lost.
    console.warn(`[NOTEBOOK_CLASSIFY] failed (${e?.message || e}); point stays in General/Unsorted.`);
  }
}

/** The Faheem notes writer prompt: one marks-style revision sheet per chapter. */
function notesSystemInstruction(profile: { board?: string; grade?: string; language?: string }): string {
  return `You are Faheem, writing a PRE-EXAM REVISION SHEET for a student (curriculum: ${profile.board || "General"}, level: ${profile.grade || "school"}, language preference: ${profile.language || "English"}).

You will receive the exact lines the student personally saved from past answers because those lines made the concept click for them. Turn them into ONE tight, structured revision sheet they can read the night before the exam.

STRUCTURE (markdown, use these sections, skip a section only if truly empty):
## Key Ideas
The core concepts, each as one crisp bullet.
## Formulas
Every formula in LaTeX ($...$ or $$...$$), each symbol defined with its unit.
## Definitions
Exam-accurate definitions an examiner would award marks for. Key terms in **bold**.
## Watch Out
The mistakes and confusions hiding in these points, each with the correction.
## One-Liners
Three to six memorable single-sentence takeaways for last-minute revision.

HARD RULES:
- Build ONLY on the student's saved points. You may complete a formula or tighten a definition for accuracy, but never introduce unrelated new topics.
- Match the student's language preference (English, Arabic, Hindi, or Urdu); keep technical terms, formulas, and units accurate in English whichever language you write in.
- Concise and marks-focused: this is a revision sheet, not a lesson. No preamble, no closing chatter.
- NEVER use an em dash (U+2014) or an en dash (U+2013) anywhere. Use commas, colons, periods, or parentheses instead.`;
}

/** Gate helper: notebook viewing needs an active Regular or Unlimited pass. */
async function notebookGate(req: Request, res: Response): Promise<{ row: any } | null> {
  const row = await getUserById(pool, (req as any).userId);
  if (!row) {
    res.status(404).json({ error: "User not found." });
    return null;
  }
  const ent = await getEntitlement(pool, row);
  if (!hasNotebookAccess(ent)) {
    const savedCount = await notebookCount(pool, row.id);
    res.status(403).json({
      error: "The Pre-exam notebook is part of the Regular and Unlimited plans.",
      code: "notebook_locked",
      savedCount,
    });
    return null;
  }
  return { row };
}

export const notebookRouter = Router();

// --- Save a selected snippet (open to EVERY signed-in account) ---
notebookRouter.post("/notebook/entries", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).userId as number;
    if (!rateLimit(`${uid}:nb-save`, 30)) {
      return res.status(429).json({ error: "You're saving very fast. Take a breath and try again in a moment. 🌱" });
    }
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) return res.status(400).json({ error: "Select the lines you want to keep first." });
    if (text.length > MAX_ENTRY_CHARS) {
      return res.status(400).json({ error: "That selection is very long. Save the lines that matter most (up to 4000 characters)." });
    }
    if ((await notebookCount(pool, uid)) >= MAX_ENTRIES_PER_USER) {
      return res.status(400).json({ error: "Your notebook is full (2000 points). Delete a few old points to make room." });
    }

    const row = await getUserById(pool, uid);
    if (!row) return res.status(404).json({ error: "User not found." });

    // A double-tap on Save must not file the same lines twice: if the exact
    // text from the same message is already saved, hand back the existing
    // point instead of inserting a twin.
    const dupe = await pool.query(
      `SELECT id FROM notebook_entries
       WHERE user_id = $1 AND text = $2 AND COALESCE(message_id, '') = COALESCE($3, '')
       LIMIT 1`,
      [uid, text, typeof req.body?.messageId === "string" ? req.body.messageId.slice(0, 80) : null]
    );
    if (dupe.rows[0]?.id) {
      return res.status(200).json({ ok: true, id: dupe.rows[0].id, duplicate: true });
    }

    const entry = {
      id: newEntryId(),
      userId: uid,
      messageId: typeof req.body?.messageId === "string" ? req.body.messageId.slice(0, 80) : null,
      conversationId: typeof req.body?.conversationId === "string" ? req.body.conversationId.slice(0, 80) : null,
      question: typeof req.body?.question === "string" ? req.body.question.slice(0, 1000) : "",
      text,
    };
    await notebookInsert(pool, entry);

    // Respond NOW; the AI files it in the background (never blocks a save).
    res.status(201).json({ ok: true, id: entry.id });
    classifyEntry(uid, entry.id, entry.question, text, row.board, row.grade).catch(() => {});
  } catch (err) {
    console.error("Notebook save error:", err);
    res.status(500).json({ error: "Could not save that to your notebook. Please try again." });
  }
});

// --- The shelf: subjects -> chapters -> counts (locked = calm summary only) ---
notebookRouter.get("/notebook", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).userId as number;
    const row = await getUserById(pool, uid);
    if (!row) return res.status(404).json({ error: "User not found." });
    const ent = await getEntitlement(pool, row);
    const savedCount = await notebookCount(pool, uid);

    if (!hasNotebookAccess(ent)) {
      return res.json({ locked: true, savedCount });
    }

    const flat = await notebookTree(pool, uid);
    const bySubject = new Map<string, { chapter: string; count: number; latestAt: string }[]>();
    for (const r of flat) {
      if (!bySubject.has(r.subject)) bySubject.set(r.subject, []);
      bySubject.get(r.subject)!.push({ chapter: r.chapter, count: r.count, latestAt: r.latestAt });
    }
    const subjects = [...bySubject.entries()].map(([subject, chapters]) => ({
      subject,
      count: chapters.reduce((n, c) => n + c.count, 0),
      chapters,
    }));
    res.json({ locked: false, savedCount, subjects });
  } catch (err) {
    console.error("Notebook tree error:", err);
    res.status(500).json({ error: "Could not open your notebook." });
  }
});

// --- One chapter: its saved points + any cached Faheem notes ---
notebookRouter.get("/notebook/entries", requireAuth, async (req: Request, res: Response) => {
  try {
    const gate = await notebookGate(req, res);
    if (!gate) return;
    const uid = (req as any).userId as number;
    const subject = String(req.query.subject || "");
    const chapter = String(req.query.chapter || "");
    if (!subject || !chapter) return res.status(400).json({ error: "A subject and chapter are required." });

    const entries = await notebookEntriesFor(pool, uid, subject, chapter);
    const note = await noteGet(pool, uid, subject, chapter);
    const stats = await notebookChapterStats(pool, uid, subject, chapter);
    res.json({
      entries,
      note: note ? { text: note.text, generatedAt: note.generatedAt, stale: noteIsStale(note, stats) } : null,
    });
  } catch (err) {
    console.error("Notebook entries error:", err);
    res.status(500).json({ error: "Could not load this chapter." });
  }
});

/**
 * A cached note is stale when the chapter's points changed after it was
 * written: a different count, OR a save newer than the note (which also
 * catches delete-one-add-one churn that leaves the count equal).
 */
function noteIsStale(note: { entryCount: number; generatedAt: string }, stats: { count: number; latestAtMs: number | null }): boolean {
  if (note.entryCount !== stats.count) return true;
  return stats.latestAtMs !== null && stats.latestAtMs > Date.parse(note.generatedAt);
}

// --- Delete one saved point (their data: allowed regardless of plan) ---
notebookRouter.delete("/notebook/entries/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).userId as number;
    if (!rateLimit(`${uid}:nb-del`, 60)) {
      return res.status(429).json({ error: "That is a lot of deleting at once. Take a breath and try again in a moment. 🌱" });
    }
    await notebookDeleteEntry(pool, uid, String(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Notebook delete error:", err);
    res.status(500).json({ error: "Could not remove that point." });
  }
});

/**
 * Build the notes prompt under hard size ceilings. The most recent points win
 * (they reflect the student's current understanding); anything trimmed is
 * logged, never silently pretended to be included.
 */
function buildNotesContent(
  subject: string,
  chapter: string,
  entries: { question: string; text: string }[]
): string {
  const recent = entries.slice(-NOTES_MAX_POINTS);
  const parts: string[] = [];
  let used = 0;
  // Walk backwards (newest first) filling the budget, then restore saved order.
  for (let i = recent.length - 1; i >= 0; i--) {
    const e = recent[i];
    const body = e.text.length > NOTES_PER_POINT_CHARS ? e.text.slice(0, NOTES_PER_POINT_CHARS) + " …" : e.text;
    const block = `--- Point${e.question ? ` (from: "${e.question.slice(0, 120)}")` : ""} ---\n${body}`;
    if (used + block.length > NOTES_TOTAL_CHARS) break;
    used += block.length;
    parts.unshift(block);
  }
  if (parts.length < entries.length) {
    console.log(`[NOTEBOOK_NOTES] size ceiling: including ${parts.length}/${entries.length} points (newest kept).`);
  }
  return `CHAPTER: ${chapter} (${subject})

THE STUDENT'S SAVED POINTS (verbatim, in the order they saved them):
${parts.join("\n\n")}`;
}

// One generation per (user, chapter) at a time: a second concurrent request
// rides the same in-flight promise instead of paying for a duplicate model call.
const inflightNotes = new Map<string, Promise<{ text: string; generatedAt: string }>>();

// --- Faheem notes: generate (or serve the cached) revision sheet ---
notebookRouter.post("/notebook/notes", requireAuth, async (req: Request, res: Response) => {
  try {
    const gate = await notebookGate(req, res);
    if (!gate) return;
    const uid = (req as any).userId as number;
    const subject = String(req.body?.subject || "");
    const chapter = String(req.body?.chapter || "");
    if (!subject || !chapter) return res.status(400).json({ error: "A subject and chapter are required." });

    const stats = await notebookChapterStats(pool, uid, subject, chapter);
    if (stats.count === 0) return res.status(400).json({ error: "Save a few points in this chapter first." });

    // Fresh cache: serve it, no model call, no cost. Staleness = count changed
    // OR a save newer than the note (catches delete-one-add-one churn too).
    const cached = await noteGet(pool, uid, subject, chapter);
    if (cached && !noteIsStale(cached, stats)) {
      return res.json({ text: cached.text, generatedAt: cached.generatedAt, stale: false, cached: true });
    }

    // A generation for this chapter is already running: ride it.
    const key = `${uid}|${subject}|${chapter}`;
    const inflight = inflightNotes.get(key);
    if (inflight) {
      const done = await inflight;
      return res.json({ ...done, stale: false, cached: true });
    }

    if (!rateLimit(`${uid}:nb-notes`, 6)) {
      return res.status(429).json({ error: "Notes are being prepared very fast. Give it a minute and try again. 🌱" });
    }

    const profile = { board: gate.row.board, grade: gate.row.grade, language: gate.row.language };
    const generation = (async () => {
      const entries = await notebookEntriesFor(pool, uid, subject, chapter);
      const system = notesSystemInstruction(profile);
      const userContent = buildNotesContent(subject, chapter, entries);

      // Faheem notes run on Gemini Flash, same brain as normal chat answers
      // (the MiniMax-first path was retired on the all_models_set_to_gemini
      // branch).
      if (!apiKey) throw new Error("notes-unavailable");
      const t0 = Date.now();
      console.log(`[GEMINI_NOTES] start (chapter=${chapter})`);
      const resp = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ role: "user", parts: [{ text: userContent }] }],
        // Extended thinking: revision sheets are a synthesis task (dedupe,
        // structure, marks-focus), which benefits from the HIGH gear.
        config: { systemInstruction: system, temperature: 0.4, thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } },
      });
      const text = resp.text || null;
      console.log(`[GEMINI_NOTES] end - ${((Date.now() - t0) / 1000).toFixed(1)}s (${text ? text.length + " chars" : "EMPTY"})`);
      if (!text) throw new Error("notes-unavailable");

      await noteUpsert(pool, uid, subject, chapter, text, stats.count);
      return { text, generatedAt: new Date().toISOString() };
    })();
    inflightNotes.set(key, generation);

    try {
      const done = await generation;
      res.json({ ...done, stale: false, cached: false });
    } finally {
      inflightNotes.delete(key);
    }
  } catch (err: any) {
    if (err?.message === "notes-unavailable") {
      return res.status(503).json({ error: "Notes cannot be prepared right now. Please try again shortly." });
    }
    console.error("Faheem notes error:", err);
    res.status(500).json({ error: "Could not prepare your notes. Please try again." });
  }
});
