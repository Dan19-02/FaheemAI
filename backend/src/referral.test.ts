/**
 * Referral-code smoke test using an in-memory Postgres (pg-mem). No real
 * database needed. Covers the schema, the atomic claim/release cycle, the
 * cap + active guards, signup attribution (email and Google paths), the
 * stats queries, and the code normalizer. Run with: npm run test:referral
 */
import { newDb } from "pg-mem";
import {
  initSchema,
  runMigrations,
  SCHEMA_SQL,
  createUser,
  findOrCreateGoogleUser,
  createReferralCode,
  getReferralCode,
  updateReferralCode,
  redeemReferralCode,
  releaseReferralCode,
  listReferralCodeStats,
  referralSignups,
  activatePlan,
} from "./db.js";
import { normalizeReferralCode, isValidReferralCodeFormat, generateReferralCode } from "./referral.js";

function assert(cond: any, label: string) {
  if (!cond) throw new Error("FAILED: " + label);
  console.log("  ✓ " + label);
}

(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const q = new Pool();

  await initSchema(q);
  assert(true, "schema created (referral_codes + users.referral_code)");

  // --- Normalizer + format ---
  assert(normalizeReferralCode("  fhm 7wq2m ") === "FHM-7WQ2M", "normalize: trims, uppercases, space becomes dash");
  assert(normalizeReferralCode("FHM_7WQ2M") === "FHM-7WQ2M", "normalize: underscore becomes dash");
  assert(normalizeReferralCode(undefined) === "", "normalize: undefined becomes empty");
  assert(isValidReferralCodeFormat("FHM-7WQ2M"), "format: accepts a generated-style code");
  assert(!isValidReferralCodeFormat("AB"), "format: rejects too-short");
  assert(!isValidReferralCodeFormat("-BAD-"), "format: rejects edge dashes");
  assert(!isValidReferralCodeFormat("HAS SPACE"), "format: rejects inner space");
  const generated = generateReferralCode();
  assert(isValidReferralCodeFormat(generated), `format: generated code is valid (${generated})`);

  // --- Create + read + update ---
  await createReferralCode(q, { code: "FHM-ACME1", partnerName: "Acme Tutoring", notes: "pilot", maxUses: 2 });
  let row = await getReferralCode(q, "FHM-ACME1");
  assert(row && row.partner_name === "Acme Tutoring" && Number(row.max_uses) === 2, "create + get round-trip");
  assert(row.active === true && Number(row.use_count) === 0, "new code starts active with zero uses");

  row = await updateReferralCode(q, "FHM-ACME1", { notes: "pilot batch 1" });
  assert(row.notes === "pilot batch 1" && row.partner_name === "Acme Tutoring", "patch updates only given fields");

  // --- Claim honours the cap ---
  assert(await redeemReferralCode(q, "FHM-ACME1"), "claim 1 of 2 succeeds");
  assert(await redeemReferralCode(q, "FHM-ACME1"), "claim 2 of 2 succeeds");
  assert(!(await redeemReferralCode(q, "FHM-ACME1")), "claim 3 is refused (cap reached)");
  await releaseReferralCode(q, "FHM-ACME1");
  assert(await redeemReferralCode(q, "FHM-ACME1"), "release hands a use back, claim works again");
  assert(!(await redeemReferralCode(q, "NO-SUCH-CODE")), "claim on unknown code is refused");

  // --- Claim honours active=false ---
  await createReferralCode(q, { code: "FHM-PAUSED", partnerName: "Paused Partner" });
  await updateReferralCode(q, "FHM-PAUSED", { active: false });
  assert(!(await redeemReferralCode(q, "FHM-PAUSED")), "claim on a paused code is refused");
  await updateReferralCode(q, "FHM-PAUSED", { active: true });
  assert(await redeemReferralCode(q, "FHM-PAUSED"), "reactivated code claims again");
  await releaseReferralCode(q, "FHM-PAUSED");

  // --- release floors at zero ---
  await releaseReferralCode(q, "FHM-PAUSED");
  await releaseReferralCode(q, "FHM-PAUSED");
  const paused = await getReferralCode(q, "FHM-PAUSED");
  assert(Number(paused.use_count) === 0, "release never drives use_count negative");

  // --- Email-path attribution ---
  const student = await createUser(q, {
    email: "ref-student@example.com",
    passwordHash: "x",
    name: "Ref Student",
    board: "General",
    grade: "10th Grade",
    language: "English",
    preferredAnalogy: "Daily Life",
    examGoals: "",
    confidenceLevel: 3,
    chapters: [],
    referralCode: "FHM-ACME1",
  });
  assert(student.referral_code === "FHM-ACME1", "createUser stamps referral_code");

  const plain = await createUser(q, {
    email: "no-ref@example.com",
    passwordHash: "x",
    name: "No Ref",
    board: "General",
    grade: "10th Grade",
    language: "English",
    preferredAnalogy: "Daily Life",
    examGoals: "",
    confidenceLevel: 3,
    chapters: [],
  });
  assert(plain.referral_code == null, "createUser without a code stays unattributed");

  // --- Google-path attribution: create-only, best-effort ---
  await createReferralCode(q, { code: "FHM-GOOG1", partnerName: "Google Path Partner" });
  const gNew = await findOrCreateGoogleUser(
    q,
    { sub: "sub-new-1", email: "gnew@example.com", name: "G New" },
    "FHM-GOOG1"
  );
  assert(gNew.created === true && gNew.row.referral_code === "FHM-GOOG1", "google create attributes the code and reports created=true");
  const goog = await getReferralCode(q, "FHM-GOOG1");
  assert(Number(goog.use_count) === 1, "google create claims exactly one use");

  const gAgain = await findOrCreateGoogleUser(
    q,
    { sub: "sub-new-1", email: "gnew@example.com", name: "G New" },
    "FHM-ACME1"
  );
  assert(gAgain.created === false && gAgain.row.referral_code === "FHM-GOOG1", "returning google student is never re-attributed (created=false)");

  const gLinked = await findOrCreateGoogleUser(
    q,
    { sub: "sub-link-1", email: "no-ref@example.com", name: "No Ref" },
    "FHM-GOOG1"
  );
  assert(gLinked.created === false && gLinked.row.referral_code == null, "linking google to an existing account does not attribute (created=false)");

  const gBadCode = await findOrCreateGoogleUser(
    q,
    { sub: "sub-new-2", email: "gnew2@example.com", name: "G New 2" },
    "NO-SUCH-CODE"
  );
  assert(gBadCode.created === true && gBadCode.row.referral_code == null, "google create with a bad code still creates, unattributed");

  // --- Stats ---
  await activatePlan(q, student.id, "regular", new Date().toISOString(), new Date(Date.now() + 86_400_000).toISOString());
  const stats = await listReferralCodeStats(q);
  const acme = stats.find((s) => s.code === "FHM-ACME1");
  assert(acme && acme.signupCount === 1 && acme.paidCount === 1, "stats count attributed signups and paid conversions");
  assert(acme!.partnerName === "Acme Tutoring" && acme!.maxUses === 2, "stats carry partner + cap");
  assert(acme!.verifiedCount === 0, "email-signup student counts as unverified until they prove the inbox");
  const googStats = stats.find((s) => s.code === "FHM-GOOG1");
  assert(googStats && googStats.signupCount === 1 && googStats.paidCount === 0, "google signup counted, not paid");
  assert(googStats!.verifiedCount === 1, "google-created student counts as verified (Google proved the email)");

  const people = await referralSignups(q, "FHM-ACME1");
  assert(people.length === 1 && people[0].email === "ref-student@example.com" && people[0].hasPaid === true,
    "signup list names the student and their paid state");
  assert(people[0].emailVerified === false, "signup list carries the verified flag");

  // --- Redeploy safety: an OLD production-shaped DB must migrate cleanly ---
  // On a real deployment the users table predates referral_code, SCHEMA_SQL's
  // CREATE TABLE IF NOT EXISTS is a no-op, and ONLY runMigrations can add the
  // column. So nothing else in SCHEMA_SQL may reference the new column: an
  // index on it there would abort the whole boot batch with 42703 and
  // crash-loop production (initDb retries, then process.exit(1)).
  assert(
    !/CREATE\s+INDEX[^;]*referral_code/i.test(SCHEMA_SQL),
    "SCHEMA_SQL must not index users.referral_code (migration-only, like idx_users_google_sub)"
  );
  // pg-mem cannot re-run CREATE TABLE IF NOT EXISTS (real Postgres can), so
  // the redeploy is simulated the same way subscription.test.ts does: build
  // the old-shape table, then run the migrations alone against it.
  const mem2 = newDb();
  const { Pool: Pool2 } = mem2.adapters.createPg();
  const q2 = new Pool2();
  await q2.query(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      name TEXT NOT NULL DEFAULT 'Student',
      board TEXT NOT NULL DEFAULT 'General',
      grade TEXT NOT NULL DEFAULT '11th Grade',
      language TEXT NOT NULL DEFAULT 'English',
      preferred_analogy TEXT NOT NULL DEFAULT 'Daily Life',
      exam_goals TEXT NOT NULL DEFAULT '',
      confidence_level INTEGER NOT NULL DEFAULT 3,
      chapters JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await runMigrations(q2);
  assert(true, "runMigrations completes against a pre-referral users table");
  await createReferralCode(q2, { code: "FHM-OLD1", partnerName: "Old DB Partner" });
  assert(await redeemReferralCode(q2, "FHM-OLD1"), "claim works on the migrated DB");
  const oldDbUser = await createUser(q2, {
    email: "old-db@example.com",
    passwordHash: "x",
    name: "Old DB",
    board: "General",
    grade: "10th Grade",
    language: "English",
    preferredAnalogy: "Daily Life",
    examGoals: "",
    confidenceLevel: 3,
    chapters: [],
    referralCode: "FHM-OLD1",
  });
  assert(oldDbUser.referral_code === "FHM-OLD1", "attribution works on the migrated DB");

  console.log("\nAll referral tests passed.");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
