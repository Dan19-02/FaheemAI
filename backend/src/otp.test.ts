/**
 * OTP + auth-code smoke test on in-memory Postgres (pg-mem). Validates the new
 * schema, the atomic verify (wrong→attempt++, right→consume, reuse→used,
 * expiry, attempt cap), supersession, throttle counting, and the
 * password-reset token_version bump. Run with: npm run test:otp
 */
import { newDb } from "pg-mem";
import {
  initSchema,
  createUser,
  getUserByEmail,
  getUserById,
  insertAuthCode,
  verifyAuthCode,
  authCodeThrottle,
  updatePasswordHash,
  setEmailVerified,
  rowToUser,
} from "./db.js";
import { generateOtp, hashOtp, timingSafeEqualHex } from "./otp.js";

function assert(cond: any, label: string) {
  if (!cond) throw new Error("FAILED: " + label);
  console.log("  ✓ " + label);
}

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const q = new Pool();
  await initSchema(q);
  assert(true, "schema created (users + auth_codes)");

  // New account is unverified; rowToUser exposes emailVerified.
  const u = await createUser(q, {
    email: "Test@Example.com",
    passwordHash: "x",
    name: "T",
    board: "General",
    grade: "11th",
    language: "English",
    preferredAnalogy: "Daily Life",
    examGoals: "",
    confidenceLevel: 3,
    chapters: [],
  });
  assert(u.email_verified === false, "new account starts email_verified = false");
  assert(rowToUser(u).emailVerified === false, "rowToUser exposes emailVerified");
  assert(u.token_version === 0, "new account token_version = 0");

  // --- Happy path: issue, wrong guess, right guess, reuse ---
  const code = generateOtp();
  assert(/^\d{6}$/.test(code), "generateOtp is 6 digits");
  await insertAuthCode(q, {
    userId: u.id,
    email: "test@example.com",
    purpose: "email_verify",
    codeHash: hashOtp(code),
    expiresAtIso: iso(10 * 60_000),
    maxAttempts: 5,
  });

  const wrong = await verifyAuthCode("test@example.com", "email_verify", hashOtp("000000"), timingSafeEqualHex, q);
  assert(wrong.ok === false && wrong.reason === "wrong", "wrong code rejected as 'wrong'");
  assert(wrong.attemptsLeft === 4, "attemptsLeft decrements after a wrong guess");

  const right = await verifyAuthCode("test@example.com", "email_verify", hashOtp(code), timingSafeEqualHex, q);
  assert(right.ok === true && right.userId === u.id, "correct code accepted, returns userId");

  const reuse = await verifyAuthCode("test@example.com", "email_verify", hashOtp(code), timingSafeEqualHex, q);
  assert(reuse.ok === false && reuse.reason === "used", "consumed code cannot be reused (single-use)");

  // --- Attempt cap ---
  const capCode = generateOtp();
  await insertAuthCode(q, { userId: u.id, email: "cap@x.com", purpose: "email_verify", codeHash: hashOtp(capCode), expiresAtIso: iso(600_000), maxAttempts: 2 });
  await verifyAuthCode("cap@x.com", "email_verify", hashOtp("111111"), timingSafeEqualHex, q); // attempts 1
  await verifyAuthCode("cap@x.com", "email_verify", hashOtp("222222"), timingSafeEqualHex, q); // attempts 2
  const locked = await verifyAuthCode("cap@x.com", "email_verify", hashOtp(capCode), timingSafeEqualHex, q); // even the RIGHT code
  assert(locked.ok === false && locked.reason === "locked", "code locks after max_attempts (right code no longer works)");

  // --- Expiry ---
  await insertAuthCode(q, { userId: u.id, email: "exp@x.com", purpose: "email_verify", codeHash: hashOtp("333333"), expiresAtIso: iso(-1000), maxAttempts: 5 });
  const expired = await verifyAuthCode("exp@x.com", "email_verify", hashOtp("333333"), timingSafeEqualHex, q);
  assert(expired.ok === false && expired.reason === "expired", "expired code rejected");

  // --- Supersession: a new issue retires the old code ---
  await insertAuthCode(q, { userId: u.id, email: "sup@x.com", purpose: "password_reset", codeHash: hashOtp("444444"), expiresAtIso: iso(600_000), maxAttempts: 5 });
  await insertAuthCode(q, { userId: u.id, email: "sup@x.com", purpose: "password_reset", codeHash: hashOtp("555555"), expiresAtIso: iso(600_000), maxAttempts: 5 });
  const oldSuperseded = await verifyAuthCode("sup@x.com", "password_reset", hashOtp("444444"), timingSafeEqualHex, q);
  assert(oldSuperseded.ok === false, "old code no longer valid after a new one is issued");
  const newest = await verifyAuthCode("sup@x.com", "password_reset", hashOtp("555555"), timingSafeEqualHex, q);
  assert(newest.ok === true, "newest code is the valid one");

  // --- Throttle counting (cooldown + hourly cap inputs) ---
  const thr = await authCodeThrottle(q, "sup@x.com", "password_reset");
  assert(thr.countLastHour >= 2 && thr.lastCreatedAtMs !== null, "authCodeThrottle counts recent codes + last time");

  // --- No code at all ---
  const none = await verifyAuthCode("nobody@x.com", "email_verify", hashOtp("999999"), timingSafeEqualHex, q);
  assert(none.ok === false && none.reason === "no_code", "no code present → 'no_code'");

  // --- Password reset bumps token_version + verifies email ---
  const before = await getUserById(q, u.id);
  const newVersion = await updatePasswordHash(q, u.id, "newhash");
  assert(newVersion === (before.token_version + 1), "updatePasswordHash bumps token_version");
  const after = await getUserById(q, u.id);
  assert(after.password_hash === "newhash", "password_hash updated");
  assert(after.email_verified === true, "reset also marks email verified");

  // --- setEmailVerified toggles ---
  const u2 = await getUserByEmail(q, "test@example.com");
  await setEmailVerified(q, u2.id, true);
  const v = await getUserById(q, u2.id);
  assert(v.email_verified === true, "setEmailVerified works");

  console.log("\nAll OTP/auth-code tests passed. ✅");
  process.exit(0);
})().catch((e) => {
  console.error("\n❌", e.message);
  process.exit(1);
});
