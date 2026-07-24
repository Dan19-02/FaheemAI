/**
 * Authentication + user-data routes.
 *
 * Email/password sign-up (collecting the full student profile up front) and
 * login, both returning a JWT. Protected routes verify the JWT and attach the
 * user id to the request. Also serves /me (profile get/update) and /messages
 * (chat history) for the signed-in student.
 */
import { Router } from "express";
import { rateLimit, STILL_CONFUSED_PROMPT } from "./ai.js";
import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import {
  pool,
  createUser,
  getUserByEmail,
  getUserById,
  findOrCreateGoogleUser,
  updateUser,
  getMessages,
  addMessage,
  deleteMessage,
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  conversationOwnedBy,
  ensureDefaultConversation,
  rowToUser,
  DEFAULT_CHAPTERS,
  setEmailVerified,
  updatePasswordHash,
  insertAuthCode,
  authCodeThrottle,
  verifyAuthCode,
  releaseReferralCode,
} from "./db.js";
import { claimReferralForSignup, normalizeReferralCode, isValidReferralCodeFormat } from "./referral.js";
import { getEntitlement, utcDateKey } from "./subscription.js";
import {
  generateOtp,
  hashOtp,
  timingSafeEqualHex,
  OTP_TTL_MIN,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SEC,
  OTP_MAX_PER_HOUR,
  type OtpPurpose,
} from "./otp.js";
import { sendVerifyCode, sendResetCode, sendGoogleOnlyNotice } from "./mailer.js";

/** The account payload sent to the client: profile + chapters + live plan/usage. */
async function accountPayload(row: any) {
  return { ...rowToUser(row), subscription: await getEntitlement(pool, row) };
}

// Compact unique id for new conversations (no external deps needed).
function newId(prefix = "conv"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret-change-me";
const TOKEN_TTL = "30d";

if (!process.env.JWT_SECRET) {
  console.warn("[Auth] JWT_SECRET not set, using an insecure dev secret. Set JWT_SECRET before deploying.");
}

// Google Identity: the frontend sends the ID token from "Continue with Google";
// we verify it locally against this client id (audience) using Google's cached
// public keys. The client SECRET is not needed for the ID-token flow.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

if (!GOOGLE_CLIENT_ID) {
  console.warn("[Auth] GOOGLE_CLIENT_ID not set: 'Continue with Google' is disabled until it is configured.");
}

export function signToken(userId: number, email: string, tokenVersion = 0): string {
  return jwt.sign({ userId, email, tokenVersion }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

/** Verify a raw token string (used by the WebSocket upgrade). Version is not
 *  enforced here: WS reconnects constantly and each reconnect re-runs this. */
export function userIdFromToken(token: string | null): number | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    return payload.userId ?? null;
  } catch {
    return null;
  }
}

/**
 * token_version enforcement lets a password reset evict older sessions. Reading
 * it from the DB on every authenticated request would add a query to a path
 * that currently does none, so we cache it in-process with a short TTL: a reset
 * on THIS instance busts the cache immediately (see bumpTokenVersionCache); on
 * another instance the stale session survives at most CACHE_TTL_MS. Documented,
 * bounded lag — acceptable for single/small-fleet deployments.
 */
const TOKEN_VERSION_TTL_MS = 30_000;
const tokenVersionCache = new Map<number, { version: number; expiresAt: number }>();

async function currentTokenVersion(userId: number): Promise<number> {
  const hit = tokenVersionCache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.version;
  try {
    const { rows } = await pool.query(`SELECT token_version FROM users WHERE id = $1`, [userId]);
    const version = rows[0] ? Number(rows[0].token_version || 0) : 0;
    tokenVersionCache.set(userId, { version, expiresAt: Date.now() + TOKEN_VERSION_TTL_MS });
    return version;
  } catch {
    // DB blip: don't turn it into a mass logout. Trust the token this time
    // (the downstream route will fail on its own if the DB is truly down).
    return -1;
  }
}

/** Refresh the cache right after a version bump so the resetting instance
 *  enforces the new version with zero lag. */
export function bumpTokenVersionCache(userId: number, version: number) {
  tokenVersionCache.set(userId, { version, expiresAt: Date.now() + TOKEN_VERSION_TTL_MS });
}

/** Express middleware: require a valid Bearer JWT whose version is current. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Please sign in to continue." });
  let payload: { userId?: number; tokenVersion?: number };
  try {
    payload = jwt.verify(token, JWT_SECRET) as any;
  } catch {
    return res.status(401).json({ error: "Please sign in to continue." });
  }
  const userId = payload?.userId;
  if (!userId) return res.status(401).json({ error: "Please sign in to continue." });

  // Backward-compat: tokens minted before token_version existed carry no claim.
  // Treat a missing claim as 0 and reject ONLY when the claim is strictly older
  // than the DB — never fail closed on absence (that would 401 the whole base).
  const claimVersion = Number(payload.tokenVersion ?? 0);
  const current = await currentTokenVersion(userId);
  if (current >= 0 && claimVersion < current) {
    return res.status(401).json({ error: "Your session ended for your security. Please sign in again." });
  }
  (req as any).userId = userId;
  next();
}

export const authRouter = Router();

/**
 * Generate + store + email a one-time code. Best-effort: callers fire-and-forget
 * so a slow or failed email never blocks (or changes the timing of) the request.
 * The plaintext code exists only here and in the email; only its HMAC is stored.
 */
async function issueCode(userId: number | null, email: string, purpose: OtpPurpose): Promise<void> {
  try {
    const code = generateOtp();
    const expiresAtIso = new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString();
    await insertAuthCode(pool, {
      userId,
      email,
      purpose,
      codeHash: hashOtp(code),
      expiresAtIso,
      maxAttempts: OTP_MAX_ATTEMPTS,
    });
    if (purpose === "email_verify") await sendVerifyCode(email, code, OTP_TTL_MIN);
    else await sendResetCode(email, code, OTP_TTL_MIN);
  } catch (e: any) {
    console.error(`[Auth] issueCode(${purpose}) failed:`, e?.message);
  }
}

// --- Sign up: collect the full student profile in one go ---
authRouter.post("/auth/signup", async (req: Request, res: Response) => {
  // A referral use claimed before the insert; released again if the insert
  // fails, so a partner's max_uses cap is never burned by a failed signup.
  let claimedRef: string | null = null;
  try {
    if (!rateLimit(`signup:ip:${req.ip}`, 15)) {
      return res.status(429).json({ error: "Too many new accounts from here right now. Please try again in a minute. 🌱" });
    }
    const {
      email,
      password,
      name,
      board,
      grade,
      language,
      preferredAnalogy,
      examGoals,
      confidenceLevel,
      referralCode,
    } = req.body || {};

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const existing = await getUserByEmail(pool, email);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists. Try signing in." });
    }

    // A supplied code must be real: a typo here is fixable (clear the field or
    // retype it), while a silently dropped code loses the partner attribution
    // this feature exists for. The claim is atomic (active + cap enforced).
    const ref = await claimReferralForSignup(referralCode);
    if (!ref.ok) return res.status(400).json({ error: ref.error });
    claimedRef = ref.code ?? null;

    const passwordHash = await bcrypt.hash(String(password), 10);
    const row = await createUser(pool, {
      email,
      passwordHash,
      name: (name || "Student").trim(),
      board: board || "General",
      grade: grade || "11th Grade",
      language: language || "English",
      preferredAnalogy: preferredAnalogy || "Daily Life",
      examGoals: examGoals || "",
      confidenceLevel: Number(confidenceLevel) || 3,
      chapters: DEFAULT_CHAPTERS,
      referralCode: claimedRef,
    });
    // The insert consumed the claim: the account now carries referral_code, so
    // a later failure (e.g. a blip while loading the entitlement for the
    // response) must NOT release the use; that would let a capped code
    // over-admit past max_uses while reporting counts the extra student.
    claimedRef = null;

    const token = signToken(row.id, row.email, row.token_version ?? 0);
    // Fire-and-forget the verification email: signup succeeds instantly (soft
    // gate) and a failed/slow send never blocks the student from starting.
    void issueCode(row.id, row.email, "email_verify");
    res.status(201).json({ token, user: await accountPayload(row) });
  } catch (err: any) {
    // claimedRef is only still set when the failure happened BEFORE the user
    // insert completed (it is nulled right after createUser), so handing the
    // use back is always correct here. Logged (not silent): if the release
    // itself fails, use_count drifts one above the true count and only this
    // line makes that visible.
    if (claimedRef) {
      void releaseReferralCode(pool, claimedRef).catch((e: any) =>
        console.error("[Referral] release after failed signup failed:", e?.message)
      );
    }
    // Unique-violation safety net (race with the existence check).
    if (err?.code === "23505") {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    console.error("Signup error:", err);
    res.status(500).json({ error: "Could not create your account. Please try again." });
  }
});

// --- Log in ---
authRouter.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    // Online brute-force brake: a human mistypes a handful of times; a script
    // hammers. Throttle by IP and by target account.
    const who = String(email).toLowerCase().trim();
    if (!rateLimit(`login:ip:${req.ip}`, 20) || !rateLimit(`login:email:${who}`, 10)) {
      return res.status(429).json({ error: "Too many tries in a row. Take a breath and try again in a minute. 🌱" });
    }
    const row = await getUserByEmail(pool, email);
    // A Google-only account has no password: tell the student to use the
    // Google button rather than a misleading "incorrect password".
    if (row && !row.password_hash) {
      return res.status(401).json({ error: "This account uses Google sign in. Tap Continue with Google." });
    }
    if (!row || !(await bcrypt.compare(String(password), row.password_hash))) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }
    const token = signToken(row.id, row.email, row.token_version ?? 0);
    res.json({ token, user: await accountPayload(row) });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Could not sign you in. Please try again." });
  }
});

// --- Continue with Google ---
// The frontend's Google Identity button hands us the credential (an ID token
// JWT). We verify it, then find or create the matching account and return our
// own session token, exactly like email/password login.
authRouter.post("/auth/google", async (req: Request, res: Response) => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      return res.status(503).json({ error: "Google sign in is not configured on this server yet." });
    }
    const credential = req.body?.credential;
    if (!credential || typeof credential !== "string") {
      return res.status(400).json({ error: "Missing Google credential." });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ error: "Could not verify your Google sign in. Please try again." });
    }

    // A valid, verified email is required to key the account.
    if (!payload?.sub || !payload.email || payload.email_verified === false) {
      return res.status(401).json({ error: "Your Google account did not return a verified email." });
    }

    // Best-effort referral attribution, applied only if this sign-in CREATES
    // the account (findOrCreateGoogleUser ignores it for returning students).
    // Never blocks: a bad code from a stale ?ref= link is dropped silently.
    const rawRef = normalizeReferralCode(req.body?.referralCode);
    const referral = rawRef && isValidReferralCodeFormat(rawRef) ? rawRef : null;

    const { row, created } = await findOrCreateGoogleUser(
      pool,
      {
        sub: payload.sub,
        email: payload.email,
        name: (payload.name || payload.given_name || "Student").trim(),
      },
      referral
    );

    const token = signToken(row.id, row.email, row.token_version ?? 0);
    // `created` lets the frontend keep a captured ?ref= code alive when this
    // turned out to be a returning student's sign-in (the code stays for the
    // next new student on a shared phone) and clear it only after a real signup.
    res.json({ token, user: await accountPayload(row), created });
  } catch (err: any) {
    // Unique-violation safety net (concurrent first sign-ins for one identity).
    if (err?.code === "23505") {
      return res.status(409).json({ error: "That account is being set up. Please try again." });
    }
    console.error("Google auth error:", err);
    res.status(500).json({ error: "Could not sign you in with Google. Please try again." });
  }
});

// --- Forgot password: request a reset code ---
// Enumeration-safe: ALWAYS returns the same body, and does the lookup + email
// out of band so response timing never reveals whether the account exists.
authRouter.post("/auth/forgot-password", async (req: Request, res: Response) => {
  const email = String(req.body?.email || "").trim();
  const who = email.toLowerCase();
  res.json({ ok: true });
  if (!/^\S+@\S+\.\S+$/.test(email)) return;
  // Throttle the WORK (not the response): bombing a victim's inbox / burning
  // send quota is the abuse. Per-IP and per-target-email, hour windows.
  if (!rateLimit(`forgot:ip:${req.ip}`, 10, 3_600_000) || !rateLimit(`forgot:email:${who}`, 5, 3_600_000)) return;
  void (async () => {
    try {
      const row = await getUserByEmail(pool, who);
      if (!row) return; // no account → send nothing (silent)
      if (!row.password_hash) return void sendGoogleOnlyNotice(row.email); // Google-only account
      // DB-backed hourly cap survives a limiter reset / second instance.
      const { countLastHour } = await authCodeThrottle(pool, who, "password_reset");
      if (countLastHour >= OTP_MAX_PER_HOUR) return;
      await issueCode(row.id, row.email, "password_reset");
    } catch (e: any) {
      console.error("forgot-password send error:", e?.message);
    }
  })();
});

// --- Reset password: verify code, set new password, auto-sign-in ---
authRouter.post("/auth/reset-password", async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.code || "").trim();
    const newPassword = String(req.body?.password || "");
    if (!email || !code) return res.status(400).json({ error: "Enter the code we emailed you." });
    if (newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
    if (!rateLimit(`reset:ip:${req.ip}`, 20, 3_600_000) || !rateLimit(`reset:email:${email}`, 10, 3_600_000)) {
      return res.status(429).json({ error: "Too many tries. Take a breath and try again in a little while. 🌱" });
    }
    const outcome = await verifyAuthCode(email, "password_reset", hashOtp(code), timingSafeEqualHex);
    // One generic message for every failure (no wrong-vs-expired oracle).
    const invalid = () => res.status(400).json({ error: "That code is invalid or has expired. Request a new one." });
    if (!outcome.ok || !outcome.userId) return invalid();

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const newVersion = await updatePasswordHash(pool, outcome.userId, passwordHash);
    if (newVersion == null) return invalid();
    // Evict older sessions immediately on this instance.
    bumpTokenVersionCache(outcome.userId, newVersion);
    const row = await getUserById(pool, outcome.userId);
    const token = signToken(row.id, row.email, row.token_version ?? newVersion);
    res.json({ token, user: await accountPayload(row) });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Could not reset your password. Please try again." });
  }
});

// --- Email verification: (re)send a code to the signed-in user ---
authRouter.post("/auth/verify-email/send", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).userId as number;
    const row = await getUserById(pool, uid);
    if (!row) return res.status(404).json({ error: "User not found." });
    if (row.email_verified === true) return res.json({ ok: true, alreadyVerified: true });
    const { lastCreatedAtMs, countLastHour } = await authCodeThrottle(pool, row.email, "email_verify");
    const sinceLastSec = lastCreatedAtMs ? (Date.now() - lastCreatedAtMs) / 1000 : Infinity;
    if (sinceLastSec < OTP_RESEND_COOLDOWN_SEC) {
      return res.status(429).json({ error: "Hang on a few seconds before asking for a new code.", retryAfterSec: Math.ceil(OTP_RESEND_COOLDOWN_SEC - sinceLastSec) });
    }
    if (countLastHour >= OTP_MAX_PER_HOUR) {
      return res.status(429).json({ error: "You've asked for several codes recently. Please try again a little later." });
    }
    await issueCode(uid, row.email, "email_verify");
    res.json({ ok: true, cooldownSec: OTP_RESEND_COOLDOWN_SEC });
  } catch (err) {
    console.error("verify-email send error:", err);
    res.status(500).json({ error: "Could not send a verification code. Please try again." });
  }
});

// --- Email verification: check the code ---
authRouter.post("/auth/verify-email", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).userId as number;
    const code = String(req.body?.code || "").trim();
    if (!code) return res.status(400).json({ error: "Enter the code we emailed you." });
    if (!rateLimit(`verify:uid:${uid}`, 15, 3_600_000)) {
      return res.status(429).json({ error: "Too many tries. Please wait a little and try again." });
    }
    const row = await getUserById(pool, uid);
    if (!row) return res.status(404).json({ error: "User not found." });
    if (row.email_verified === true) return res.json({ user: await accountPayload(row) });

    const outcome = await verifyAuthCode(row.email, "email_verify", hashOtp(code), timingSafeEqualHex);
    if (!outcome.ok) {
      // The user owns this account, so distinct copy is safe (helps completion).
      const msg =
        outcome.reason === "wrong" && typeof outcome.attemptsLeft === "number"
          ? `That code isn't right — ${outcome.attemptsLeft} ${outcome.attemptsLeft === 1 ? "try" : "tries"} left.`
          : "That code is invalid or has expired. Tap resend for a new one.";
      return res.status(400).json({ error: msg, reason: outcome.reason });
    }
    await setEmailVerified(pool, uid, true);
    const fresh = await getUserById(pool, uid);
    res.json({ user: await accountPayload(fresh) });
  } catch (err) {
    console.error("verify-email error:", err);
    res.status(500).json({ error: "Could not verify your email. Please try again." });
  }
});

// --- Current user ---
authRouter.get("/me", requireAuth, async (req: Request, res: Response) => {
  const row = await getUserById(pool, (req as any).userId);
  if (!row) return res.status(404).json({ error: "User not found." });
  res.json({ user: await accountPayload(row) });
});

// --- Lifetime study stats (the study-lamp days + Doubts-cleared milestones) ---
// daysActive is the count of distinct UTC days with at least one asked
// question. Read-only and light (rate-limited, one indexed column, no row cap
// so a heavy user's oldest days are never silently dropped).
authRouter.get("/me/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).userId as number;
    if (!rateLimit(`stats:${uid}`, 30)) {
      return res.status(429).json({ error: "One moment, then try again." });
    }
    // Only created_at (the covering index idx_messages_user already orders it),
    // no LIMIT: distinct-day counting must see every day, and dropping the
    // NEWEST rows (an ASC LIMIT) would break "active today" for busy students.
    const { rows } = await pool.query(
      `SELECT created_at FROM messages WHERE user_id = $1 AND role = 'user'`,
      [uid]
    );
    const days = new Set<string>();
    for (const r of rows) days.add(utcDateKey(new Date(r.created_at).getTime()));
    // "Doubts cleared" counts real asks: every user message except the one-tap
    // "Still fuzzy?" sentinel (a retry signal, not a new doubt).
    const { rows: cnt } = await pool.query(
      `SELECT count(*) AS n FROM messages WHERE user_id = $1 AND role = 'user' AND text <> $2`,
      [uid, STILL_CONFUSED_PROMPT]
    );
    res.json({
      daysActive: days.size,
      activeToday: days.has(utcDateKey()),
      doubtsCleared: Number(cnt[0]?.n || 0),
    });
  } catch (e) {
    console.error("stats read error:", e);
    res.status(500).json({ error: "Could not load your stats right now." });
  }
});

// --- Update profile + study log ---
authRouter.put("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    const row = await updateUser(pool, (req as any).userId, {
      name: (b.name || "Student").trim(),
      board: b.board || "General",
      grade: b.grade || "11th Grade",
      language: b.language || "English",
      preferredAnalogy: b.preferredAnalogy || "Daily Life",
      examGoals: b.examGoals || "",
      confidenceLevel: Number(b.confidenceLevel) || 3,
      chapters: Array.isArray(b.chapters) ? b.chapters : [],
    });
    if (!row) return res.status(404).json({ error: "User not found." });
    res.json({ user: await accountPayload(row) });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: "Could not save your changes." });
  }
});

// --- Conversations (separate chat windows) ---

// List the student's conversations, creating a default one on first visit
// (also adopts any legacy messages saved before conversations existed).
authRouter.get("/conversations", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).userId;
    await ensureDefaultConversation(pool, uid, newId());
    const conversations = await listConversations(pool, uid);
    res.json({ conversations });
  } catch (err) {
    console.error("List conversations error:", err);
    res.status(500).json({ error: "Could not load your conversations." });
  }
});

authRouter.post("/conversations", requireAuth, async (req: Request, res: Response) => {
  try {
    const title = (req.body?.title || "New chat").toString().slice(0, 120);
    const conversation = await createConversation(pool, (req as any).userId, newId(), title);
    res.status(201).json({ conversation });
  } catch (err) {
    console.error("Create conversation error:", err);
    res.status(500).json({ error: "Could not start a new chat." });
  }
});

authRouter.patch("/conversations/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const title = (req.body?.title || "").toString().trim().slice(0, 120);
    if (!title) return res.status(400).json({ error: "A title is required." });
    await renameConversation(pool, (req as any).userId, String(req.params.id), title);
    res.json({ ok: true });
  } catch (err) {
    console.error("Rename conversation error:", err);
    res.status(500).json({ error: "Could not rename this chat." });
  }
});

authRouter.delete("/conversations/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    await deleteConversation(pool, (req as any).userId, String(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete conversation error:", err);
    res.status(500).json({ error: "Could not delete this chat." });
  }
});

// --- Chat history (scoped to one conversation) ---
authRouter.get("/conversations/:id/messages", requireAuth, async (req: Request, res: Response) => {
  const uid = (req as any).userId;
  if (!(await conversationOwnedBy(pool, uid, String(req.params.id)))) {
    return res.status(404).json({ error: "Conversation not found." });
  }
  const messages = await getMessages(pool, uid, String(req.params.id));
  res.json({ messages });
});

authRouter.post("/conversations/:id/messages", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).userId;
    const { id, role, text, mode, sources, attachments, deepFor } = req.body || {};
    if (!id || !role || typeof text !== "string") {
      return res.status(400).json({ error: "Invalid message." });
    }
    if (!(await conversationOwnedBy(pool, uid, String(req.params.id)))) {
      return res.status(404).json({ error: "Conversation not found." });
    }
    await addMessage(pool, uid, {
      id,
      conversationId: String(req.params.id),
      role,
      text,
      mode,
      sources,
      attachments,
      deepFor: typeof deepFor === "string" && deepFor ? deepFor : undefined,
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Add message error:", err);
    res.status(500).json({ error: "Could not save message." });
  }
});

// Remove a single message. Used to unwind the optimistically saved question
// when the paywall blocks it, so no orphan bubble lingers in the study log.
authRouter.delete("/conversations/:id/messages/:messageId", requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).userId;
    if (!(await conversationOwnedBy(pool, uid, String(req.params.id)))) {
      return res.status(404).json({ error: "Conversation not found." });
    }
    await deleteMessage(pool, uid, String(req.params.id), String(req.params.messageId));
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete message error:", err);
    res.status(500).json({ error: "Could not remove the message." });
  }
});
