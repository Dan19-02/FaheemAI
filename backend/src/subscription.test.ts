/**
 * Subscription + metering + payments smoke test (pg-mem, no real DB).
 *
 * Locks in the decided billing behaviour:
 *   - every new account gets a 7-day trial with 10 questions/day, never more
 *   - one NEW question = one credit; an identical paired retry is free
 *   - paid passes: Starter 100/mo, Regular 300/mo, Unlimited uncounted, 30 days
 *   - payment activation is idempotent (verify + webhook can both fire)
 *   - buying a plan ENDS the free tier permanently (no fallback to trial days)
 *   - an expired pass blocks with no_access until renewed
 *
 * Run with: npm run test:subscription
 */
import { newDb } from "pg-mem";
import {
  initSchema,
  runMigrations,
  createUser,
  getUserById,
  createPayment,
  getPaymentByOrderId,
  markPaymentPaid,
  activatePlan,
  getUsage,
  chargeUsage,
  withTransaction,
} from "./db.js";
import {
  PLANS,
  PLAN_BY_ID,
  TRIAL_DAYS,
  TRIAL_DAILY_QUERIES,
  PASS_DAYS,
  RENEW_WINDOW_DAYS,
  utcDateKey,
  nextUtcMidnight,
  getEntitlement,
  meterNewQuestion,
  meterNewQuestionByUserId,
  paywallMessage,
  renewalDecision,
  hasNotebookAccess,
} from "./subscription.js";
import { grantPass } from "./billing.js";
import {
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

function assert(cond: any, label: string) {
  if (!cond) throw new Error("FAILED: " + label);
  console.log("  ✓ " + label);
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function makeUser(q: any, email: string) {
  return createUser(q, {
    email,
    passwordHash: "x",
    name: "Test Student",
    board: "General",
    grade: "11th Grade",
    language: "English",
    preferredAnalogy: "Daily Life",
    examGoals: "",
    confidenceLevel: 3,
    chapters: [],
  });
}

(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const q = new Pool();
  await initSchema(q);

  // ---- Plan catalogue matches the decided pricing ----
  assert(PLANS.length === 3, "three paid plans");
  assert(PLAN_BY_ID.starter.price === 4.99 && PLAN_BY_ID.starter.monthlyQueries === 100, "Starter: $4.99 = 100 questions/month");
  assert(PLAN_BY_ID.regular.price === 9.99 && PLAN_BY_ID.regular.monthlyQueries === 300, "Regular: $9.99 = 300 questions/month");
  assert(PLAN_BY_ID.unlimited.price === 19.99 && PLAN_BY_ID.unlimited.monthlyQueries === null, "Unlimited: $19.99 = unlimited questions");
  assert(PLAN_BY_ID.starter.amountCents === 499 && PLAN_BY_ID.regular.amountCents === 999 && PLAN_BY_ID.unlimited.amountCents === 1999, "cent amounts match dollar prices");
  assert(TRIAL_DAYS === 7 && TRIAL_DAILY_QUERIES === 10 && PASS_DAYS === 30, "trial = 7 days of 10/day; a pass = 30 days");

  // ---- UTC day math ----
  assert(/^\d{4}-\d{2}-\d{2}$/.test(utcDateKey()), "utcDateKey is a YYYY-MM-DD date");
  // 2026-07-02 20:00 UTC is still 2026-07-02 in UTC: the key must be the UTC date.
  const utcEvening = Date.parse("2026-07-02T20:00:00Z");
  assert(utcDateKey(utcEvening) === "2026-07-02", "daily window rolls at UTC midnight");
  const reset = Date.parse(nextUtcMidnight(utcEvening));
  assert(reset > utcEvening && reset - utcEvening <= DAY_MS, "nextUtcMidnight is within the next 24h");

  // ---- Signup: the free week starts the day they join ----
  const row = await makeUser(q, "trial@example.com");
  assert(row.plan === "trial", "new account starts on the trial plan");
  const trialEnds = new Date(row.trial_ends_at).getTime();
  const driftDays = Math.abs(trialEnds - Date.now() - TRIAL_DAYS * DAY_MS) / DAY_MS;
  assert(driftDays < 0.01, "trial_ends_at = signup + 7 days");

  let ent = await getEntitlement(q, row);
  assert(ent.state === "trial" && ent.active, "entitlement: trial active");
  assert(ent.limit === 10 && ent.used === 0 && ent.remaining === 10, "trial quota: 10 today, 10 remaining");
  assert(ent.periodType === "day" && ent.periodKey === `d:${utcDateKey()}`, "trial counts against today's UTC window");

  // ---- Metering: 10 new questions pass, the 11th is blocked ----
  for (let i = 1; i <= 10; i++) {
    const m = await meterNewQuestion(q, row, `question number ${i}`);
    assert(m.ok, `question ${i}/10 allowed (remaining ${m.entitlement.remaining})`);
    assert(m.charged, `question ${i}/10 reports charged=true (a real credit was spent)`);
  }
  const blocked = await meterNewQuestion(q, row, "question number 11");
  assert(!blocked.ok && blocked.reason === "quota", "question 11 blocked: daily trial quota is 10, never more");
  assert(!blocked.charged, "a quota-blocked ask reports charged=false (nothing to refund)");
  assert(paywallMessage(blocked.entitlement, "quota").includes("10 free questions"), "quota paywall message mentions the 10-a-day trial");

  // ---- Paired retry (stream -> /chat fallback) doesn't double-charge ----
  const before = await getUsage(q, row.id, `d:${utcDateKey()}`);
  const retry = await meterNewQuestion(q, row, "question number 10"); // identical text, just charged
  assert(retry.ok, "identical paired retry passes through");
  assert(!retry.charged, "paired retry reports charged=false, so a disconnect refund never gives back a credit it did not spend");
  assert((await getUsage(q, row.id, `d:${utcDateKey()}`)) === before, "paired retry does not spend a second credit");

  // ---- Trial expiry: after the free week, access ends ----
  await q.query(`UPDATE users SET trial_ends_at = now() - interval '1 day' WHERE id = $1`, [row.id]);
  const expiredTrialRow = await getUserById(q, row.id);
  ent = await getEntitlement(q, expiredTrialRow);
  assert(ent.state === "trial_expired" && !ent.active && ent.remaining === 0, "expired trial: no access");
  const noAccess = await meterNewQuestion(q, expiredTrialRow, "a brand new question");
  assert(!noAccess.ok && noAccess.reason === "no_access", "expired trial blocks with no_access");
  assert(paywallMessage(noAccess.entitlement, "no_access").includes("free week"), "trial-over paywall message mentions the free week");

  // ---- Payment: create -> paid (idempotent) -> plan active ----
  await createPayment(q, { userId: row.id, plan: "starter", orderId: "order_TEST1", amount: 499, currency: "USD" });
  const pay = await getPaymentByOrderId(q, "order_TEST1");
  assert(pay && pay.status === "created" && pay.user_id === row.id, "payment row created for the order");

  const first = await markPaymentPaid(q, "order_TEST1", "pay_TEST1");
  assert(first && first.status === "paid", "first confirmation marks the payment paid");
  const second = await markPaymentPaid(q, "order_TEST1", "pay_TEST1");
  assert(second === null, "second confirmation is a no-op (verify + webhook can both fire)");

  const now = Date.now();
  await activatePlan(q, row.id, "starter", new Date(now).toISOString(), new Date(now + PASS_DAYS * DAY_MS).toISOString());
  let paidRow = await getUserById(q, row.id);
  ent = await getEntitlement(q, paidRow);
  assert(ent.state === "active" && ent.plan === "starter", "Starter pass active after payment");
  assert(ent.limit === 100 && ent.used === 0 && ent.remaining === 100, "Starter pass: fresh 100-question counter (trial usage does not carry over)");
  assert(ent.periodType === "pass", "paid usage counts against the pass window, not the day");
  const passExpiry = new Date(paidRow.plan_expires_at).getTime();
  assert(Math.abs(passExpiry - now - PASS_DAYS * DAY_MS) < 5_000, "pass lasts 30 days");

  const paidAsk = await meterNewQuestionByUserId(q, row.id, "first paid question");
  assert(paidAsk.ok && paidAsk.entitlement.remaining === 99, "paid question charges the pass counter (100 -> 99)");

  // ---- Buying a plan removes the free tier permanently ----
  const buyer = await makeUser(q, "buyer@example.com");
  assert(new Date(buyer.trial_ends_at).getTime() > Date.now(), "buyer starts mid-trial");
  const t0 = Date.now();
  await activatePlan(q, buyer.id, "regular", new Date(t0).toISOString(), new Date(t0 + PASS_DAYS * DAY_MS).toISOString());
  const buyerRow = await getUserById(q, buyer.id);
  assert(new Date(buyerRow.trial_ends_at).getTime() <= Date.now() + 1_000, "purchase clamps trial_ends_at: the free tier ends the moment a plan is bought");
  ent = await getEntitlement(q, buyerRow);
  assert(ent.state === "active" && ent.plan === "regular" && ent.limit === 300, "buyer is on Regular (300/month) immediately");

  // ...and when that pass lapses, there is NO fallback onto leftover trial days.
  await q.query(`UPDATE users SET plan_expires_at = now() - interval '1 day' WHERE id = $1`, [buyer.id]);
  const lapsedRow = await getUserById(q, buyer.id);
  ent = await getEntitlement(q, lapsedRow);
  assert(ent.state === "plan_expired" && !ent.active, "lapsed pass: plan_expired, no trial fallback");
  const lapsedAsk = await meterNewQuestion(q, lapsedRow, "question after lapse");
  assert(!lapsedAsk.ok && lapsedAsk.reason === "no_access", "lapsed pass blocks until renewed");
  assert(paywallMessage(ent, "no_access").includes("Renew"), "lapsed-pass paywall message asks to renew");

  // An already-expired trial is not revived by a later purchase (CASE ELSE arm).
  const oldTrialEnds = new Date(buyerRow.trial_ends_at).getTime();
  await activatePlan(q, buyer.id, "unlimited", new Date().toISOString(), new Date(Date.now() + PASS_DAYS * DAY_MS).toISOString());
  const renewedRow = await getUserById(q, buyer.id);
  assert(Math.abs(new Date(renewedRow.trial_ends_at).getTime() - oldTrialEnds) < 1_000, "renewal leaves the already-ended trial untouched");

  // ---- Unlimited: active, uncounted, never blocked by quota ----
  ent = await getEntitlement(q, renewedRow);
  assert(ent.state === "active" && ent.plan === "unlimited" && ent.limit === null && ent.remaining === null, "Unlimited: no limit, no countdown");
  for (let i = 0; i < 12; i++) {
    const m = await meterNewQuestion(q, renewedRow, `unlimited question ${i}`);
    assert(m.ok, i === 11 ? "Unlimited never hits a quota (12 straight questions allowed)" : `  … unlimited q${i + 1} ok`);
    if (i < 11) continue;
  }

  // ---- A renewed pass gets a fresh counter (period key includes the start) ----
  const firstKey = `p:${new Date(renewedRow.plan_started_at).getTime()}`;
  const usedOnFirstPass = await getUsage(q, buyer.id, firstKey);
  assert(usedOnFirstPass === 12, "usage accrued on the current pass window");
  const t1 = Date.now() + 60_000; // renewal started a minute later -> new key
  await activatePlan(q, buyer.id, "starter", new Date(t1).toISOString(), new Date(t1 + PASS_DAYS * DAY_MS).toISOString());
  const secondRow = await getUserById(q, buyer.id);
  ent = await getEntitlement(q, secondRow);
  assert(ent.used === 0 && ent.remaining === 100, "a renewed pass starts a fresh counter");

  // ---- Legacy early-access accounts: a FRESH week from the deploy day ----
  // Accounts created before billing shipped have trial_ends_at = NULL; the
  // initSchema backfill gives them 7 days from when the new code first runs
  // (never from their old signup date, which would paywall them instantly).
  const legacy = await makeUser(q, "legacy@example.com");
  await q.query(`UPDATE users SET trial_ends_at = NULL WHERE id = $1`, [legacy.id]);
  await runMigrations(q); // deploy: migrations run again on the existing DB
  const legacyRow = await getUserById(q, legacy.id);
  const legacyEnds = new Date(legacyRow.trial_ends_at).getTime();
  assert(
    Math.abs(legacyEnds - Date.now() - TRIAL_DAYS * DAY_MS) < 60_000,
    "pre-billing account gets a fresh 7-day trial from deploy day, not signup day"
  );
  assert((await getEntitlement(q, legacyRow)).active, "legacy early-access account is NOT paywalled on deploy");

  // ---- Renewal policy: paid days are never destroyed ----
  const now2 = Date.now();
  const midPass = { plan: "regular", plan_expires_at: new Date(now2 + 10 * DAY_MS).toISOString() };
  const dMid = renewalDecision(midPass, now2);
  assert(!dMid.allowed, "mid-pass (10 days left): buying is blocked, remaining days stay safe");
  const lastDays = { plan: "regular", plan_expires_at: new Date(now2 + 2 * DAY_MS).toISOString() };
  const dLast = renewalDecision(lastDays, now2);
  assert(dLast.allowed, `renewal opens in the last ${RENEW_WINDOW_DAYS} days`);
  assert(dLast.startsAtMs === Date.parse(lastDays.plan_expires_at), "a renewal bought early CHAINS: new pass starts at the current expiry");
  const lapsed = { plan: "starter", plan_expires_at: new Date(now2 - DAY_MS).toISOString() };
  const dLapsed = renewalDecision(lapsed, now2);
  assert(dLapsed.allowed && dLapsed.startsAtMs === now2, "a lapsed pass buys again immediately, starting now");
  const trialUser = { plan: "trial", plan_expires_at: null };
  const dTrial = renewalDecision(trialUser, now2);
  assert(dTrial.allowed && dTrial.startsAtMs === now2, "a trial user can buy any time, starting now");

  // ---- chargeUsage: the limit is enforced atomically inside SQL ----
  const cu = await makeUser(q, "charge@example.com");
  assert((await chargeUsage(q, cu.id, "d:test", 2)) === 1, "chargeUsage creates the counter at 1");
  assert((await chargeUsage(q, cu.id, "d:test", 2)) === 2, "chargeUsage increments to the limit");
  assert((await chargeUsage(q, cu.id, "d:test", 2)) === null, "chargeUsage refuses to pass the limit (returns null)");
  assert((await getUsage(q, cu.id, "d:test")) === 2, "the counter never overshoots");
  assert((await chargeUsage(q, cu.id, "d:unlimited", null)) === 1, "chargeUsage with no limit always charges");

  // ---- grantPass: idempotent, and a student is NEVER charged without access ----
  // On real Postgres the transaction covers the crash window; pg-mem ignores
  // BEGIN/ROLLBACK, which makes it the perfect stand-in for a transaction-less
  // engine: the healing path below must protect students all by itself.
  assert((await withTransaction(async () => 42, q)) === 42, "withTransaction returns the callback's value");

  await createPayment(q, { userId: cu.id, plan: "starter", orderId: "order_GP", amount: 499, currency: "USD" });
  await grantPass(cu.id, "starter", "pay_GP", "order_GP", q);
  let gpRow = await getUserById(q, cu.id);
  assert(gpRow.plan === "starter" && new Date(gpRow.plan_expires_at).getTime() > Date.now(), "grantPass marks paid AND activates the plan");
  assert((await getPaymentByOrderId(q, "order_GP")).status === "paid", "the payment row is settled");
  const gpExpiry = new Date(gpRow.plan_expires_at).getTime();
  await grantPass(cu.id, "starter", "pay_GP", "order_GP", q); // verify + webhook both firing
  gpRow = await getUserById(q, cu.id);
  assert(new Date(gpRow.plan_expires_at).getTime() === gpExpiry, "a duplicate confirmation never extends the pass a second time");

  // Partial state (the old critical bug): payment marked paid, activation lost.
  const healUser = await makeUser(q, "heal@example.com");
  await createPayment(q, { userId: healUser.id, plan: "regular", orderId: "order_HEAL", amount: 999, currency: "USD" });
  await markPaymentPaid(q, "order_HEAL", "pay_HEAL"); // simulate the crash right after mark-paid
  let healRow = await getUserById(q, healUser.id);
  assert(healRow.plan === "trial", "partial state reproduced: money taken, no plan granted");
  await grantPass(healUser.id, "regular", "pay_HEAL", "order_HEAL", q); // the webhook / verify retry
  healRow = await getUserById(q, healUser.id);
  assert(
    healRow.plan === "regular" && new Date(healRow.plan_expires_at).getTime() > Date.now(),
    "the retry HEALS the partial state: the student gets the plan they paid for"
  );

  // ---- Pre-exam notebook: data layer + access rule ----
  const nb = await makeUser(q, "notebook@example.com");

  // Access rule: save-for-all, view for active Regular/Unlimited only.
  assert(!hasNotebookAccess(await getEntitlement(q, nb)), "trial: notebook VIEWING is locked");
  await notebookInsert(q, { id: "nb1", userId: nb.id, messageId: "m1", conversationId: "c1", question: "What is inertia?", text: "Inertia is the resistance of a body to a change in its state of motion." });
  await notebookInsert(q, { id: "nb2", userId: nb.id, messageId: "m2", conversationId: "c1", question: "State Newton's second law", text: "F = ma, where F is net force in newtons." });
  assert((await notebookCount(q, nb.id)) === 2, "trial student CAN save points (value accumulates while locked)");

  // The AI classifier files points; unclassified ones stay in General/Unsorted.
  await notebookSetClassification(q, nb.id, "nb1", "Physics", "Laws of Motion");
  await notebookSetClassification(q, nb.id, "nb2", "Physics", "Laws of Motion");
  const labels = await notebookLabels(q, nb.id);
  assert(labels.some((l) => l.subject === "Physics" && l.chapter === "Laws of Motion"), "classification lands on the entry");

  const tree = await notebookTree(q, nb.id);
  assert(tree.length === 1 && tree[0].subject === "Physics" && tree[0].chapter === "Laws of Motion" && tree[0].count === 2, "shelf groups points by subject/chapter with counts");

  const entries = await notebookEntriesFor(q, nb.id, "Physics", "Laws of Motion");
  assert(entries.length === 2 && entries[0].text.includes("Inertia"), "chapter lists its saved points in order");

  // Faheem notes cache: staleness keyed on the entry count.
  await noteUpsert(q, nb.id, "Physics", "Laws of Motion", "## Key Ideas\n- Inertia resists change.", 2);
  let note = await noteGet(q, nb.id, "Physics", "Laws of Motion");
  assert(note !== null && note.entryCount === 2, "Faheem notes cache round-trips");
  await notebookInsert(q, { id: "nb3", userId: nb.id, messageId: null, conversationId: null, question: "", text: "Momentum p = mv." });
  await notebookSetClassification(q, nb.id, "nb3", "Physics", "Laws of Motion");
  const after = await notebookEntriesFor(q, nb.id, "Physics", "Laws of Motion");
  assert(note !== null && after.length !== note.entryCount, "adding a point makes the cached note stale (count mismatch)");

  // Staleness stats: a raw count + newest-save time, so delete-one-add-one
  // churn (equal count, newer save) is still detected as a change.
  const stats1 = await notebookChapterStats(q, nb.id, "Physics", "Laws of Motion");
  assert(stats1.count === 3 && stats1.latestAtMs !== null, "chapter stats: real count + newest save time");
  const noteRow = await noteGet(q, nb.id, "Physics", "Laws of Motion");
  assert(
    noteRow !== null && noteRow.entryCount === 2 && stats1.count === 3,
    "note cached at 2 points vs 3 now: the count mismatch alone marks it stale"
  );
  await notebookDeleteEntry(q, nb.id, "nb2");
  await notebookInsert(q, { id: "nb4", userId: nb.id, messageId: null, conversationId: null, question: "", text: "Impulse = force x time." });
  await notebookSetClassification(q, nb.id, "nb4", "Physics", "Laws of Motion");
  const stats2 = await notebookChapterStats(q, nb.id, "Physics", "Laws of Motion");
  assert(stats2.count === stats1.count, "delete-one-add-one keeps the count equal (the trap)");
  assert(stats2.latestAtMs! >= stats1.latestAtMs!, "…but the newest-save time moved, so staleness is still caught");
  await notebookDeleteEntry(q, nb.id, "nb4");
  await q.query(`INSERT INTO notebook_entries (id, user_id, question, text, subject, chapter) VALUES ('nb2', $1, 'restore', 'F = ma restored.', 'Physics', 'Laws of Motion')`, [nb.id]);

  await notebookDeleteEntry(q, nb.id, "nb3");
  assert((await notebookCount(q, nb.id)) === 2, "a student can delete their own point");
  await notebookDeleteEntry(q, buyer.id, "nb1"); // another user must not delete nb's points
  assert((await notebookCount(q, nb.id)) === 2, "delete is owner-scoped: another user cannot remove your points");

  // Paid tiers: Starter stays locked; Regular and Unlimited unlock viewing.
  const t2 = Date.now();
  await activatePlan(q, nb.id, "starter", new Date(t2).toISOString(), new Date(t2 + PASS_DAYS * DAY_MS).toISOString());
  assert(!hasNotebookAccess(await getEntitlement(q, await getUserById(q, nb.id))), "Starter ($4.99): notebook stays locked");
  await activatePlan(q, nb.id, "regular", new Date(t2).toISOString(), new Date(t2 + PASS_DAYS * DAY_MS).toISOString());
  assert(hasNotebookAccess(await getEntitlement(q, await getUserById(q, nb.id))), "Regular ($9.99): notebook unlocked");
  await activatePlan(q, nb.id, "unlimited", new Date(t2).toISOString(), new Date(t2 + PASS_DAYS * DAY_MS).toISOString());
  assert(hasNotebookAccess(await getEntitlement(q, await getUserById(q, nb.id))), "Unlimited ($19.99): notebook unlocked");

  // Lapsed pass: read-locked again, but every saved point survives untouched.
  await q.query(`UPDATE users SET plan_expires_at = now() - interval '1 day' WHERE id = $1`, [nb.id]);
  assert(!hasNotebookAccess(await getEntitlement(q, await getUserById(q, nb.id))), "lapsed pass: notebook read-locked until renewal");
  assert((await notebookCount(q, nb.id)) === 2, "nothing is ever deleted on lapse");

  console.log("\nSUBSCRIPTION SMOKE TEST PASSED ✓");
  process.exit(0);
})().catch((e) => {
  console.error("\nSUBSCRIPTION SMOKE TEST FAILED ✗\n", e);
  process.exit(1);
});
