/**
 * DB-layer smoke test using an in-memory Postgres (pg-mem). No real database
 * needed. Validates the schema + the exact queries used by signup/login/profile/
 * messages/cache, plus the bcrypt + JWT flow. Run with: npm run test:db
 */
import { newDb } from "pg-mem";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  initSchema,
  createUser,
  getUserByEmail,
  updateUser,
  addMessage,
  getMessages,
  createConversation,
  listConversations,
  deleteConversation,
  cacheGetByKey,
  cacheUpsertFull,
  cacheCandidates,
  cacheMarkVerified,
  knowledgeInsert,
  knowledgeCount,
  knowledgeAll,
  knowledgeDeleteAll,
  recordComprehensionEvent,
  listComprehensionEventsSince,
  upsertConceptMastery,
  getConceptMastery,
  canonAll,
  canonInsert,
  rowToUser,
} from "./db.js";

function assert(cond: any, label: string) {
  if (!cond) throw new Error("FAILED: " + label);
  console.log("  ✓ " + label);
}

(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const q = new Pool();

  await initSchema(q);
  assert(true, "schema created");

  const passwordHash = await bcrypt.hash("secret123", 10);
  // Seed a non-empty literal (DEFAULT_CHAPTERS is intentionally empty now) so the
  // JSONB chapters round-trip is still genuinely exercised.
  const seedChapters = [
    { id: "sc1", name: "Test Chapter A", mastery: "weak", confidenceScore: 20, lastStudied: "2026-06-29" },
    { id: "sc2", name: "Test Chapter B", mastery: "strong", confidenceScore: 90, lastStudied: "2026-06-29" },
  ];
  const row = await createUser(q, {
    email: "Alex@Example.com",
    passwordHash,
    name: "Alex",
    board: "High School",
    grade: "12th",
    language: "English",
    preferredAnalogy: "Sports",
    examGoals: "Ace the physics final",
    confidenceLevel: 3,
    chapters: seedChapters,
  });
  assert(row.email === "alex@example.com", "email is lowercased on insert");
  assert(
    row.chapters.length === 2 && row.chapters[0].name === "Test Chapter A" && row.chapters[1].confidenceScore === 90,
    "chapters round-trip through the JSONB column"
  );

  const byEmail = await getUserByEmail(q, "ALEX@example.com");
  assert(byEmail && (await bcrypt.compare("secret123", byEmail.password_hash)), "login: password verifies");
  assert(!(await bcrypt.compare("wrongpass", byEmail.password_hash)), "login: wrong password rejected");

  const token = jwt.sign({ userId: row.id, email: row.email }, "testsecret", { expiresIn: "30d" });
  const decoded = jwt.verify(token, "testsecret") as any;
  assert(decoded.userId === row.id, "JWT signs + verifies");

  const updated = await updateUser(q, row.id, {
    name: "Alex K",
    board: "Exam Prep",
    grade: "Gap year",
    language: "English",
    preferredAnalogy: "Trains",
    examGoals: "Top marks in the entrance exam",
    confidenceLevel: 4,
    chapters: [{ id: "x", name: "Optics", mastery: "weak", confidenceScore: 20, lastStudied: "2026-06-27" }],
  });
  assert(updated.board === "Exam Prep" && updated.chapters.length === 1, "profile + chapters update");

  const profileShape = rowToUser(updated);
  assert(profileShape.profile.preferredAnalogy === "Trains", "rowToUser maps camelCase profile");

  const conv = await createConversation(q, row.id, "conv-1", "Physics doubts");
  assert(conv.id === "conv-1" && conv.title === "Physics doubts", "conversation create");

  await addMessage(q, row.id, { id: "m1", conversationId: conv.id, role: "user", text: "Explain inertia", mode: "standard", sources: [] });
  await addMessage(q, row.id, { id: "m1", conversationId: conv.id, role: "user", text: "Explain inertia (deep-checked)", sources: [] }); // upsert by id
  const msgs = await getMessages(q, row.id, conv.id, 50);
  assert(msgs.length === 1, "messages dedupe by id (still one row after re-save)");
  assert(msgs[0].text === "Explain inertia (deep-checked)", "re-saving a message id updates its text (deep-check replace)");
  assert(msgs[0].deepFor === undefined, "a plain message has no deepFor link");

  // Deep-dive link: a notebook remembers which answer's "Go deeper" made it,
  // and a corrective re-save (which omits the link) must not erase it.
  await addMessage(q, row.id, { id: "m2", conversationId: conv.id, role: "model", text: "The full notebook", deepFor: "m1" });
  await addMessage(q, row.id, { id: "m2", conversationId: conv.id, role: "model", text: "The full notebook (deep-checked)" });
  const withLink = (await getMessages(q, row.id, conv.id, 50)).find((m) => m.id === "m2");
  assert(withLink?.deepFor === "m1", "deepFor round-trips through save + load");
  assert(withLink?.text === "The full notebook (deep-checked)", "re-save updates notebook text");

  // Lost-first-save ordering: the deep-check re-save CREATES the row without
  // the link (the linked save died on a flaky network), then the link arrives
  // on a later save and backfills, but never overwrites an existing link.
  await addMessage(q, row.id, { id: "m3", conversationId: conv.id, role: "model", text: "Notebook (deep-checked)" });
  await addMessage(q, row.id, { id: "m3", conversationId: conv.id, role: "model", text: "Notebook", deepFor: "m1" });
  let rescued = (await getMessages(q, row.id, conv.id, 50)).find((m) => m.id === "m3");
  assert(rescued?.deepFor === "m1", "a later save backfills deepFor onto a row created without it");
  await addMessage(q, row.id, { id: "m3", conversationId: conv.id, role: "model", text: "Notebook", deepFor: "OTHER" });
  rescued = (await getMessages(q, row.id, conv.id, 50)).find((m) => m.id === "m3");
  assert(rescued?.deepFor === "m1", "an existing deepFor link is never overwritten");

  const convList = await listConversations(q, row.id);
  assert(convList.length === 1 && convList[0].messageCount === 3, "conversation list reports message count");

  await deleteConversation(q, row.id, conv.id);
  assert((await listConversations(q, row.id)).length === 0, "conversation delete cascades messages");
  assert((await getMessages(q, row.id, conv.id, 50)).length === 0, "messages gone after conversation delete");

  const facets = { mode: "standard", board: "High School", grade: "12th", language: "English", preferredAnalogy: "Daily Life" };
  await cacheUpsertFull(q, { cacheKey: "k1", ...facets, question: "what is inertia", embedding: [0.1, 0.2, 0.3], text: "cached answer", sources: [{ title: "T", uri: "u" }] });
  await cacheUpsertFull(q, { cacheKey: "k1", ...facets, question: "what is inertia", embedding: [0.1, 0.2, 0.3], text: "updated answer", sources: [] }); // upsert
  const cached = await cacheGetByKey(q, "k1");
  assert(cached && cached.text === "updated answer", "explanation cache upsert + read by key");
  assert(cached && cached.verified === false, "cache entries are unverified by default");

  // Deep-verify bookkeeping: verified writes round-trip, candidates expose the
  // flag + key (so unverified semantic hits can be examined and upgraded), and
  // cacheMarkVerified upgrades an entry with the examiner's (corrected) text.
  await cacheUpsertFull(q, { cacheKey: "k2", ...facets, question: "newton second law", embedding: [0.2, 0.1, 0], text: "deep-checked answer", sources: [], verified: true });
  const cached2 = await cacheGetByKey(q, "k2");
  assert(cached2 !== null && cached2.verified === true, "verified flag round-trips through upsert + read");

  const cands = await cacheCandidates(q, facets);
  assert(
    cands.length === 2 && cands.every((c) => typeof c.verified === "boolean" && typeof c.cacheKey === "string" && c.cacheKey.length > 0),
    "semantic candidates expose cacheKey + verified"
  );

  await cacheMarkVerified(q, "k1", "corrected answer");
  const upgraded = await cacheGetByKey(q, "k1");
  assert(upgraded !== null && upgraded.verified === true && upgraded.text === "corrected answer", "cacheMarkVerified upgrades text + flag");

  await knowledgeInsert(q, { id: "kc1", subject: "Physics", topic: "Inertia", board: "General", grade: "11", content: "Inertia note", embedding: [0.1, 0.2, 0.3] });
  assert((await knowledgeCount(q)) === 1, "knowledge insert + count");
  const chunks = await knowledgeAll(q);
  assert(chunks.length === 1 && Array.isArray(chunks[0].embedding), "knowledge embedding round-trips as a JS array");

  // Stale-embedding recovery path (cacheClearMismatchedEmbeddings uses
  // jsonb_array_length, which pg-mem lacks; its call site is try/catch-safe).
  await knowledgeDeleteAll(q);
  assert((await knowledgeCount(q)) === 0, "knowledgeDeleteAll purges the corpus for re-ingestion");

  // Landing Signal storage: the exact queries recordLanding + the session
  // summary + the forgetting curve use, run against pg-mem.
  await recordComprehensionEvent(q, {
    userId: row.id, conversationId: null, conceptKey: "ohms-law", conceptLabel: "Ohm's Law",
    chapterTag: "Electricity", triggerType: "check_pass", verdict: "understood", confidence: "high", source: "check",
  });
  const todays = await listComprehensionEventsSince(q, row.id, new Date(Date.now() - 60_000).toISOString());
  assert(todays.length === 1 && todays[0].trigger_type === "check_pass", "comprehension events read back since a timestamp");

  await upsertConceptMastery(q, row.id, "ohms-law", {
    conceptLabel: "Ohm's Law", state: "landed", incProbedPass: 1, stampPassNow: true,
    reviewStage: 0, nextReviewAt: new Date(Date.now() + 3 * 864e5).toISOString(),
  });
  let mastery = await getConceptMastery(q, row.id, "ohms-law");
  assert(mastery?.state === "landed" && mastery.probed_pass_count === 1, "mastery upsert applies state + pass delta");
  assert(!!mastery?.first_seen_at, "first_seen_at is stamped on first insert");
  assert(!!mastery?.next_review_at && mastery.review_stage === 0, "forgetting-curve schedule round-trips");
  await upsertConceptMastery(q, row.id, "ohms-law", { nextReviewAt: null, reviewStage: 3 });
  mastery = await getConceptMastery(q, row.id, "ohms-law");
  assert(mastery?.next_review_at === null && mastery.review_stage === 3, "explicit null clears next_review_at");
  await upsertConceptMastery(q, row.id, "ohms-law", { canonicalKey: "ohms-law" });
  mastery = await getConceptMastery(q, row.id, "ohms-law");
  assert(mastery?.canonical_key === "ohms-law", "canonical shadow key round-trips");

  await canonInsert(q, "ohms-law", "Ohm's Law", [0.1, 0.2]);
  await canonInsert(q, "ohms-law", "duplicate", null); // ON CONFLICT DO NOTHING
  const canon = await canonAll(q);
  assert(canon.length === 1 && Array.isArray(canon[0].embedding), "canon registry inserts once + embedding round-trips");

  console.log("\nDB SMOKE TEST PASSED ✓");
  process.exit(0);
})().catch((e) => {
  console.error("\nDB SMOKE TEST FAILED ✗\n", e);
  process.exit(1);
});
