/**
 * PostgreSQL data layer.
 *
 * Every query function takes a `Queryable` (defaults to the shared pool) so the
 * exact same code can run against the real database in production and against an
 * in-memory Postgres (pg-mem) in tests.
 */
import pg from "pg";

const { Pool } = pg;

/** Anything with a node-postgres style `.query()` (real pool or pg-mem). */
export interface Queryable {
  query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
}

/**
 * The active database pool. Set by initDb() at startup. It is either a real
 * PostgreSQL pool, or an in-memory pg-mem pool as a zero-setup dev fallback.
 * Exported as a live binding so route modules always see the current pool.
 */
export let pool: any = null;

/** Which engine is live: reported by /api/health so a production instance
 *  silently missing its real database can be detected from the outside. */
export let dbMode: "postgres" | "memory" = "memory";

/**
 * Connect to Postgres. Behaviour depends on where DATABASE_URL points:
 *
 * - REMOTE url (production): retry with backoff (serverless Postgres like Neon
 *   can be waking from suspend at boot), and if it is STILL unreachable, exit
 *   the process instead of falling back to memory. Silently downgrading a
 *   billing-enabled production server to a throwaway in-memory DB loses
 *   accounts and PAYMENTS: students would see "incorrect email or password"
 *   on real accounts, and anything they buy would vanish on restart. Crashing
 *   keeps the failure visible and lets the platform restart us until the
 *   database is back.
 * - LOCAL url or unset (development): single attempt, then the zero-setup
 *   in-memory fallback, same as always.
 */
/**
 * Managed Postgres (Neon, Render, Supabase) presents a certificate signed by a
 * provider CA that is not in Node's trust store, so we connect with
 * `ssl: { rejectUnauthorized: false }`. The catch: if the URL carries an
 * `sslmode` param, the current pg-connection-string maps `require`/`prefer`/
 * `verify-ca` to `verify-full`, which turns certificate verification back ON and
 * overrides our explicit ssl option, so the handshake dies with "self-signed
 * certificate in certificate chain". Stripping the libpq ssl params leaves our
 * explicit ssl config as the single source of truth (and silences the
 * pg-connection-string deprecation warning).
 */
export function stripSslParams(raw: string): string {
  try {
    const u = new URL(raw);
    for (const p of ["sslmode", "ssl", "sslrootcert", "sslcert", "sslkey"]) {
      u.searchParams.delete(p);
    }
    return u.toString();
  } catch {
    return raw; // not a parseable URL: leave it untouched
  }
}

export async function initDb(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const isLocal = /localhost|127\.0\.0\.1/.test(url);
    const connectionString = stripSslParams(url);
    const attempts = isLocal ? 1 : Math.max(1, Number(process.env.DB_CONNECT_ATTEMPTS) || 6);
    const connectTimeoutMs = Math.max(1_000, Number(process.env.DB_CONNECT_TIMEOUT_MS) || 15_000);

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const candidate = new Pool({
        connectionString,
        ssl: process.env.PGSSL === "false" || isLocal ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: connectTimeoutMs,
      });
      try {
        await candidate.query("SELECT 1");
        // A dropped idle connection (managed PG reaps them; failovers) emits
        // 'error' on the pool; with no listener Node treats it as uncaught and
        // kills the whole process. Log it and let node-postgres reconnect.
        candidate.on("error", (err) => console.error("[DB] idle client error (non-fatal):", err?.message || err));
        pool = candidate;
        await initSchema(pool);
        dbMode = "postgres";
        console.log("[DB] Connected to PostgreSQL.");
        return;
      } catch (e: any) {
        try {
          await candidate.end();
        } catch {
          /* ignore */
        }
        console.warn(`[DB] Postgres attempt ${attempt}/${attempts} failed: ${e.message}`);
        if (attempt < attempts) await new Promise((r) => setTimeout(r, attempt * 5_000));
      }
    }

    if (!isLocal) {
      console.error(
        "[DB] FATAL: DATABASE_URL is set but the database is unreachable after all retries. " +
          "REFUSING to start on the in-memory fallback: existing accounts would look deleted and new accounts and payments would be lost. " +
          "Fix DATABASE_URL (or wake/restore the database) and redeploy."
      );
      process.exit(1);
    }
    console.warn(`[DB] Could not reach local Postgres. Falling back to in-memory dev DB.`);
  } else {
    console.warn("[DB] DATABASE_URL not set.");
  }

  // In production the in-memory fallback would silently vanish all accounts and
  // payments on the next restart; refuse it. (index.ts already asserts
  // DATABASE_URL is set before start(); this is the backstop for any init path.)
  if (process.env.NODE_ENV === "production") {
    console.error("[DB] FATAL: no reachable DATABASE_URL in production; refusing the in-memory fallback (data would reset on every restart).");
    process.exit(1);
  }

  // Zero-setup in-memory fallback (data resets on restart). DEV ONLY.
  const { newDb } = await import("pg-mem");
  const PgMemPool = newDb().adapters.createPg().Pool;
  pool = new PgMemPool();
  await initSchema(pool);
  dbMode = "memory";
  console.warn("[DB] ⚠ Using IN-MEMORY database: data resets on restart. Set a real DATABASE_URL to persist.");
}

export interface ChapterSeed {
  id: string;
  name: string;
  mastery: "weak" | "developing" | "strong";
  confidenceScore: number;
  lastStudied: string;
}

// New accounts start with an empty Chapter Mastery list (no demo/prefilled data).
export const DEFAULT_CHAPTERS: ChapterSeed[] = [];

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  -- Nullable: accounts created via "Continue with Google" have no password and
  -- are matched by google_sub (Google's stable per-user id) instead.
  password_hash TEXT,
  google_sub TEXT UNIQUE,
  name TEXT NOT NULL DEFAULT 'Student',
  board TEXT NOT NULL DEFAULT 'General',
  grade TEXT NOT NULL DEFAULT '11th Grade',
  language TEXT NOT NULL DEFAULT 'English',
  preferred_analogy TEXT NOT NULL DEFAULT 'Daily Life',
  exam_goals TEXT NOT NULL DEFAULT '',
  confidence_level INTEGER NOT NULL DEFAULT 3,
  chapters JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Billing: every account starts on a 'trial' plan; a paid one-time pass sets
  -- plan to starter/regular/unlimited and stamps plan_started_at/plan_expires_at.
  plan TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ,
  plan_started_at TIMESTAMPTZ,
  plan_expires_at TIMESTAMPTZ,
  -- Email ownership. Fresh DBs default new rows to false; the migration
  -- grandfathers every PRE-EXISTING account to true so nobody is locked out.
  -- Google accounts are created with true (Google already proved the email).
  email_verified BOOLEAN NOT NULL DEFAULT false,
  -- Bumped on every password reset. Embedded in the JWT and checked by
  -- requireAuth, so a reset evicts any session minted with an older version.
  token_version INTEGER NOT NULL DEFAULT 0,
  -- Partner attribution: the referral code entered at signup (normalized,
  -- uppercase). Plain TEXT with no FK, matching messages.conversation_id, so
  -- it works on every engine and a deleted code never blocks user deletes.
  referral_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- NOTE: idx_users_referral_code deliberately lives ONLY in runMigrations. On a
-- pre-existing database this CREATE TABLE is a no-op, so the column does not
-- exist until the migration ALTER runs; an index here would abort the whole
-- SCHEMA_SQL batch at boot (same reason idx_users_google_sub is migration-only).

-- Referral codes handed to partners (financial institutes, schools, creators).
-- One row per code; users.referral_code points back at code. use_count exists
-- ONLY to enforce max_uses atomically at claim time; reporting always counts
-- attributed users (the source of truth) instead.
CREATE TABLE IF NOT EXISTS referral_codes (
  code TEXT PRIMARY KEY,
  partner_name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  max_uses INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One-time codes for email verification + password reset (unified, purpose-
-- discriminated). We store HMAC(code) not the code; consumed_at makes a code
-- single-use; attempts caps guessing. email is denormalized so the reset flow
-- stays enumeration-safe and survives a concurrent user delete.
CREATE TABLE IF NOT EXISTS auth_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_codes_email_purpose ON auth_codes(email, purpose, created_at);

-- Per-question usage counters. period_key is 'd:YYYY-MM-DD' for the daily trial
-- quota (reset midnight UTC) or 'p:<pass-start-ms>' for a paid monthly pass, so
-- a fresh pass gets a fresh counter automatically.
CREATE TABLE IF NOT EXISTS usage_counters (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, period_key)
);

-- Razorpay payments (one-time monthly pass). One row per created order; status
-- moves created -> paid once the signature (or webhook) confirms capture.
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  order_id TEXT UNIQUE NOT NULL,
  payment_id TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'created',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  mode TEXT,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- For a deep-dive notebook: the id of the answer whose "Go deeper" produced
  -- it. Lets the client keep that button one-shot across reloads.
  deep_for TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS explanation_cache (
  cache_key TEXT PRIMARY KEY,
  mode TEXT,
  board TEXT,
  grade TEXT,
  language TEXT,
  preferred_analogy TEXT,
  question TEXT,
  embedding JSONB,
  text TEXT NOT NULL,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pre-exam notebook: lines a student selected from answers, auto-filed by AI
-- into subject/chapter. Saving is open to every account (value accumulates);
-- VIEWING the notebook requires an active Regular or Unlimited pass.
CREATE TABLE IF NOT EXISTS notebook_entries (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id TEXT,
  conversation_id TEXT,
  question TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'General',
  chapter TEXT NOT NULL DEFAULT 'Unsorted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notebook_user ON notebook_entries(user_id, subject, chapter, created_at);

-- Cached "Faheem notes": one AI-generated revision sheet per chapter, rebuilt
-- only when the chapter's saved points change (entry_count is the staleness key).
CREATE TABLE IF NOT EXISTS notebook_notes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  chapter TEXT NOT NULL,
  text TEXT NOT NULL,
  entry_count INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, subject, chapter)
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  subject TEXT,
  topic TEXT,
  board TEXT,
  grade TEXT,
  content TEXT NOT NULL,
  embedding JSONB NOT NULL
);

-- The Landing Signal (see landing.ts): whether a concept has landed for a student.
-- comprehension_events is an append-only audit log and the honesty source of
-- truth; concept_mastery is the derived per-concept state the UI reads. We
-- store only DERIVED verdicts, never the student's raw answers (minors).
CREATE TABLE IF NOT EXISTS comprehension_events (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT,
  concept_key TEXT NOT NULL,
  concept_label TEXT,
  chapter_tag TEXT,
  -- still_fuzzy | check_pass | check_partial | check_fail | check_echoed
  -- | deeper | stuck | rephrase_ok | new_topic | affirmation_only | silent
  trigger_type TEXT NOT NULL,
  verdict TEXT NOT NULL,           -- understood | partial | not_understood | unconfirmed
  confidence TEXT NOT NULL,        -- high | medium | low
  source TEXT NOT NULL,            -- tap | check | inferred | self_report
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_events_user ON comprehension_events(user_id, created_at);

CREATE TABLE IF NOT EXISTS concept_mastery (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept_key TEXT NOT NULL,
  concept_label TEXT,
  chapter_tag TEXT,
  -- working_on_it | practiced | landed  (never asserted silently as 'strong')
  state TEXT NOT NULL DEFAULT 'working_on_it',
  probed_pass_count INTEGER NOT NULL DEFAULT 0,   -- examiner-graded transfer PASSes
  struggle_count INTEGER NOT NULL DEFAULT 0,      -- trusted negatives
  inferred_pass_count INTEGER NOT NULL DEFAULT 0, -- behavioral (never promotes alone)
  last_pass_at TIMESTAMPTZ,                        -- for spaced confirmation (later-day 2nd pass = landed)
  last_verdict TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- first measured touch (time-to-understand runs from here)
  -- Forgetting curve: how many post-landed retention passes (0..3) and when
  -- the next gentle re-check is due. NULL next_review_at = nothing scheduled.
  review_stage INTEGER NOT NULL DEFAULT 0,
  next_review_at TIMESTAMPTZ,
  -- Shadow canonical id: normalized cross-student concept identity. Written in
  -- the background, read by nothing user-facing yet (aggregation groundwork).
  canonical_key TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, concept_key)
);

-- Global registry of canonical concepts (label + embedding for match-by-meaning).
CREATE TABLE IF NOT EXISTS concept_canon (
  canonical_key TEXT PRIMARY KEY,
  label TEXT,
  embedding JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export async function initSchema(q: Queryable = pool): Promise<void> {
  await q.query(SCHEMA_SQL);
  await runMigrations(q);
}

/**
 * Defensive migrations for databases created before newer columns existed.
 * Split from initSchema so tests can simulate a redeploy against an existing
 * database (pg-mem cannot re-run CREATE TABLE IF NOT EXISTS; real Postgres can).
 */
export async function runMigrations(q: Queryable = pool): Promise<void> {
  for (const sql of [
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id TEXT`,
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb`,
    // Deep-dive link: which answer's "Go deeper" produced this notebook.
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS deep_for TEXT`,
    `ALTER TABLE explanation_cache ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE`,
    // Google sign-in: link accounts by Google's stable subject id, and let
    // Google-only accounts have no password. Runs once against existing DBs.
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT`,
    `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL`,
    // Billing columns for accounts created before subscriptions shipped.
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMPTZ`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ`,
    // Email verification, for accounts created before it shipped. Added WITHOUT
    // a default first (ADD COLUMN ... DEFAULT false would flag every existing
    // account unverified in one shot), then GRANDFATHER all pre-existing rows to
    // true, THEN set the default so future signups start unverified. We stop
    // short of SET NOT NULL on purpose (like first_seen_at): it would force a
    // full-table ACCESS EXCLUSIVE scan on the boot path that blocks listen, and
    // createUser/createGoogleUser always write the column explicitly anyway.
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN`,
    `UPDATE users SET email_verified = true WHERE email_verified IS NULL`,
    `ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT false`,
    // Session-eviction counter for password reset. Constant default = a
    // metadata-only add on modern Postgres (no table rewrite); existing rows = 0.
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0`,
    // Partner referral attribution, for databases created before it shipped.
    // Nullable with no default: existing accounts simply have no referrer.
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)`,
    `CREATE TABLE IF NOT EXISTS referral_codes (
      code TEXT PRIMARY KEY,
      partner_name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT true,
      max_uses INTEGER,
      use_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    // One-time codes (verification + reset), for databases created before this.
    `CREATE TABLE IF NOT EXISTS auth_codes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_auth_codes_email_purpose ON auth_codes(email, purpose, created_at)`,
    // Existing early-access accounts (created before billing shipped) get a
    // FRESH week from the day this code first runs, honouring the "free while
    // in early access, plans switch on at launch" promise. Runs once per
    // account: after this backfill, trial_ends_at is never NULL again. New
    // signups are unaffected (createUser stamps signup + 7 days explicitly).
    `UPDATE users SET trial_ends_at = now() + interval '7 days' WHERE trial_ends_at IS NULL`,
    // Landing Signal tables, added for databases created before this feature.
    `CREATE TABLE IF NOT EXISTS comprehension_events (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_id TEXT,
      concept_key TEXT NOT NULL,
      concept_label TEXT,
      chapter_tag TEXT,
      trigger_type TEXT NOT NULL,
      verdict TEXT NOT NULL,
      confidence TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS concept_mastery (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      concept_key TEXT NOT NULL,
      concept_label TEXT,
      chapter_tag TEXT,
      state TEXT NOT NULL DEFAULT 'working_on_it',
      probed_pass_count INTEGER NOT NULL DEFAULT 0,
      struggle_count INTEGER NOT NULL DEFAULT 0,
      inferred_pass_count INTEGER NOT NULL DEFAULT 0,
      last_pass_at TIMESTAMPTZ,
      last_verdict TEXT,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      review_stage INTEGER NOT NULL DEFAULT 0,
      next_review_at TIMESTAMPTZ,
      canonical_key TEXT,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, concept_key)
    )`,
    // Time-to-understand + forgetting curve + canonical shadow id, for
    // databases created before these columns existed. first_seen_at is added
    // WITHOUT a default first (ADD COLUMN ... DEFAULT now() would stamp every
    // existing row with the deploy time and the backfill would never fire),
    // then future inserts get the default, then existing rows backfill from
    // last_seen_at (the least-wrong available anchor), once.
    `ALTER TABLE concept_mastery ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ`,
    `ALTER TABLE concept_mastery ALTER COLUMN first_seen_at SET DEFAULT now()`,
    `UPDATE concept_mastery SET first_seen_at = last_seen_at WHERE first_seen_at IS NULL`,
    `ALTER TABLE concept_mastery ADD COLUMN IF NOT EXISTS review_stage INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE concept_mastery ADD COLUMN IF NOT EXISTS next_review_at TIMESTAMPTZ`,
    `ALTER TABLE concept_mastery ADD COLUMN IF NOT EXISTS canonical_key TEXT`,
    // Concepts that were already landed before the forgetting curve shipped
    // get their first gentle re-check scheduled. review_stage = 0 guards this
    // to run once: a concept that later completes the ladder holds stage 3.
    `UPDATE concept_mastery SET next_review_at = now() + interval '3 days'
      WHERE state = 'landed' AND next_review_at IS NULL AND review_stage = 0`,
    `CREATE INDEX IF NOT EXISTS idx_comp_events_user ON comprehension_events(user_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS concept_canon (
      canonical_key TEXT PRIMARY KEY,
      label TEXT,
      embedding JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  ]) {
    try {
      await q.query(sql);
    } catch {
      /* column already exists / engine lacks IF NOT EXISTS: safe to ignore */
    }
  }
}

/** Shape returned to the client (camelCase profile + chapters). */
export function rowToUser(row: any) {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.email_verified === true,
    profile: {
      name: row.name,
      board: row.board,
      grade: row.grade,
      language: row.language,
      preferredAnalogy: row.preferred_analogy,
      examGoals: row.exam_goals,
      confidenceLevel: row.confidence_level,
    },
    chapters: row.chapters || [],
  };
}

export interface NewUser {
  email: string;
  passwordHash: string;
  name: string;
  board: string;
  grade: string;
  language: string;
  preferredAnalogy: string;
  examGoals: string;
  confidenceLevel: number;
  chapters: any[];
  /** Normalized partner referral code claimed for this signup (or null). */
  referralCode?: string | null;
}

// Every new account gets one free week from the moment they join. Kept in sync
// with subscription.ts TRIAL_DAYS (duplicated here to avoid an import cycle).
const SIGNUP_TRIAL_DAYS = 7;

export async function createUser(q: Queryable, u: NewUser) {
  const trialEndsAt = new Date(Date.now() + SIGNUP_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { rows } = await q.query(
    // email_verified defaults to false, but set it explicitly so a new account
    // is never left ambiguous regardless of when the column default landed.
    `INSERT INTO users (email, password_hash, name, board, grade, language, preferred_analogy, exam_goals, confidence_level, chapters, plan, trial_ends_at, email_verified, referral_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'trial',$11, false, $12)
     RETURNING *`,
    [
      u.email.toLowerCase(),
      u.passwordHash,
      u.name,
      u.board,
      u.grade,
      u.language,
      u.preferredAnalogy,
      u.examGoals,
      u.confidenceLevel,
      JSON.stringify(u.chapters),
      trialEndsAt,
      u.referralCode || null,
    ]
  );
  return rows[0];
}

export async function getUserByEmail(q: Queryable, email: string) {
  const { rows } = await q.query(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase()]);
  return rows[0] || null;
}

export async function getUserById(q: Queryable, id: number) {
  const { rows } = await q.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

// ---- Google sign-in ----

export async function getUserByGoogleSub(q: Queryable, sub: string) {
  const { rows } = await q.query(`SELECT * FROM users WHERE google_sub = $1`, [sub]);
  return rows[0] || null;
}

/** Link a Google identity to an existing (email/password) account. */
export async function linkGoogleSub(q: Queryable, id: number, sub: string) {
  // Linking Google to an existing email/password account also verifies the
  // email: Google just proved the student controls that inbox.
  const { rows } = await q.query(
    `UPDATE users SET google_sub = $2, email_verified = true, updated_at = now() WHERE id = $1 RETURNING *`,
    [id, sub]
  );
  return rows[0] || null;
}

export interface NewGoogleUser {
  email: string;
  googleSub: string;
  name: string;
  /** Normalized partner referral code claimed for this signup (or null). */
  referralCode?: string | null;
}

/** Create an account from a verified Google identity (no password). */
export async function createGoogleUser(q: Queryable, u: NewGoogleUser) {
  const trialEndsAt = new Date(Date.now() + SIGNUP_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { rows } = await q.query(
    // email_verified = true: Google only returns identities with a verified email
    // (auth.ts rejects email_verified === false), so there is nothing to re-prove.
    `INSERT INTO users (email, password_hash, google_sub, name, board, grade, language, preferred_analogy, exam_goals, confidence_level, chapters, plan, trial_ends_at, email_verified, referral_code)
     VALUES ($1, NULL, $2, $3, 'General', '11th Grade', 'English', 'Daily Life', '', 3, $4, 'trial', $5, true, $6)
     RETURNING *`,
    [u.email.toLowerCase(), u.googleSub, u.name || "Student", JSON.stringify(DEFAULT_CHAPTERS), trialEndsAt, u.referralCode || null]
  );
  return rows[0];
}

/**
 * Resolve a verified Google identity to a user row, creating or linking as
 * needed: match by google_sub first, then adopt an existing same-email account
 * (linking the two), otherwise create a fresh Google-only account.
 *
 * Referral attribution is best-effort and CREATE-only: a returning student who
 * happens to carry a ?ref= link must never be re-attributed, and an invalid or
 * exhausted code must never block a Google sign-in (the student cannot fix a
 * code mid-OAuth the way the email form can). The claim (redeemReferralCode)
 * enforces active + max_uses atomically; when it fails the account is simply
 * created unattributed.
 *
 * Returns { row, created } so the caller can tell a fresh signup from a
 * returning sign-in (the frontend keeps a captured ?ref= code alive until a
 * signup actually consumes it).
 */
export async function findOrCreateGoogleUser(
  q: Queryable,
  g: { sub: string; email: string; name: string },
  referralCode?: string | null
): Promise<{ row: any; created: boolean }> {
  const bySub = await getUserByGoogleSub(q, g.sub);
  if (bySub) return { row: bySub, created: false };

  const byEmail = await getUserByEmail(q, g.email);
  if (byEmail) {
    // Existing password account signing in with Google for the first time:
    // link them so both paths reach the same study log.
    return {
      row: byEmail.google_sub ? byEmail : await linkGoogleSub(q, byEmail.id, g.sub),
      created: false,
    };
  }

  let claimed: string | null = null;
  if (referralCode) {
    try {
      claimed = (await redeemReferralCode(q, referralCode)) ? referralCode : null;
    } catch {
      claimed = null; // attribution is never worth failing an account creation
    }
  }
  try {
    const row = await createGoogleUser(q, { email: g.email, googleSub: g.sub, name: g.name, referralCode: claimed });
    return { row, created: true };
  } catch (e) {
    // Creation failed after a successful claim (e.g. a concurrent first
    // sign-in for the same identity): hand the use back so the cap stays true.
    // Logged (not silent): if this release itself fails, use_count drifts one
    // above the true count and only this line makes that visible.
    if (claimed) void releaseReferralCode(q, claimed).catch((err: any) => console.error("[Referral] release after failed Google create failed:", err?.message));
    throw e;
  }
}

export interface ProfileUpdate {
  name: string;
  board: string;
  grade: string;
  language: string;
  preferredAnalogy: string;
  examGoals: string;
  confidenceLevel: number;
  chapters: any[];
}

export async function updateUser(q: Queryable, id: number, p: ProfileUpdate) {
  const { rows } = await q.query(
    `UPDATE users SET
       name=$2, board=$3, grade=$4, language=$5, preferred_analogy=$6,
       exam_goals=$7, confidence_level=$8, chapters=$9, updated_at=now()
     WHERE id=$1
     RETURNING *`,
    [
      id,
      p.name,
      p.board,
      p.grade,
      p.language,
      p.preferredAnalogy,
      p.examGoals,
      p.confidenceLevel,
      JSON.stringify(p.chapters),
    ]
  );
  return rows[0] || null;
}

// ---- Email verification + password reset ----

/** Flip a user's email_verified flag (verification success, or a reset — which
 *  proves inbox control too). */
export async function setEmailVerified(q: Queryable, userId: number, verified: boolean): Promise<void> {
  await q.query(`UPDATE users SET email_verified = $2, updated_at = now() WHERE id = $1`, [userId, verified]);
}

/**
 * Set a new password AND bump token_version in one statement, so every session
 * minted before the reset (including a stolen one) is evicted. A reset also
 * verifies the email — the student just proved they control the inbox. Returns
 * the new token_version so the caller can mint a fresh, still-valid session.
 */
export async function updatePasswordHash(q: Queryable, userId: number, passwordHash: string): Promise<number | null> {
  const { rows } = await q.query(
    `UPDATE users SET password_hash = $2, token_version = token_version + 1,
       email_verified = true, updated_at = now()
     WHERE id = $1 RETURNING token_version`,
    [userId, passwordHash]
  );
  return rows[0] ? Number(rows[0].token_version) : null;
}

export interface NewAuthCode {
  userId: number | null;
  email: string;
  purpose: string;
  codeHash: string;
  expiresAtIso: string;
  maxAttempts: number;
}

/**
 * Issue a fresh code, first retiring any older unconsumed code for the same
 * (email, purpose) so only the newest is ever valid (single active code).
 */
export async function insertAuthCode(q: Queryable, c: NewAuthCode): Promise<void> {
  await q.query(
    `UPDATE auth_codes SET consumed_at = now()
     WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [c.email.toLowerCase(), c.purpose]
  );
  await q.query(
    `INSERT INTO auth_codes (user_id, email, purpose, code_hash, expires_at, max_attempts)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [c.userId, c.email.toLowerCase(), c.purpose, c.codeHash, c.expiresAtIso, c.maxAttempts]
  );
}

/** Send-throttle inputs: newest issue time + how many codes went out this hour,
 *  both DB-backed so a limiter reset or a second instance cannot reopen them. */
export async function authCodeThrottle(
  q: Queryable,
  email: string,
  purpose: string
): Promise<{ lastCreatedAtMs: number | null; countLastHour: number }> {
  const { rows } = await q.query(
    `SELECT max(created_at) AS last, count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS n
     FROM auth_codes WHERE email = $1 AND purpose = $2`,
    [email.toLowerCase(), purpose]
  );
  const last = rows[0]?.last ? new Date(rows[0].last).getTime() : null;
  return { lastCreatedAtMs: last, countLastHour: Number(rows[0]?.n || 0) };
}

/** Flat shape (not a discriminated union): the project runs with strict:false,
 *  where union narrowing on `ok` is unreliable, so every field is just optional
 *  and callers branch on `.ok`. */
export interface VerifyOutcome {
  ok: boolean;
  userId?: number | null;
  email?: string;
  reason?: "no_code" | "used" | "expired" | "locked" | "wrong";
  attemptsLeft?: number;
}

/**
 * Atomically check-and-consume the newest code for (email, purpose). The whole
 * read → compare → (consume | increment) runs inside one transaction with the
 * row locked (SELECT ... FOR UPDATE), so N concurrent guesses serialize: the
 * attempt counter can't be lost-updated past the cap and a correct code can be
 * consumed exactly once. `codeHash` is the HMAC of the submitted code.
 */
export async function verifyAuthCode(
  email: string,
  purpose: string,
  codeHash: string,
  compare: (storedHash: string, submittedHash: string) => boolean,
  p: any = pool
): Promise<VerifyOutcome> {
  return withTransaction<VerifyOutcome>(async (tx): Promise<VerifyOutcome> => {
    const { rows } = await tx.query(
      `SELECT id, user_id, email, code_hash, attempts, max_attempts, expires_at, consumed_at
       FROM auth_codes WHERE email = $1 AND purpose = $2
       ORDER BY created_at DESC LIMIT 1
       FOR UPDATE`,
      [email.toLowerCase(), purpose]
    );
    const row = rows[0];
    if (!row) return { ok: false, reason: "no_code" };
    if (row.consumed_at) return { ok: false, reason: "used" };
    if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };
    if (row.attempts >= row.max_attempts) return { ok: false, reason: "locked" };

    if (!compare(String(row.code_hash), codeHash)) {
      await tx.query(`UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
      return { ok: false, reason: "wrong", attemptsLeft: Math.max(0, row.max_attempts - (row.attempts + 1)) };
    }
    await tx.query(`UPDATE auth_codes SET consumed_at = now(), attempts = attempts + 1 WHERE id = $1`, [row.id]);
    return { ok: true, userId: row.user_id ?? null, email: row.email };
  }, p);
}

// ---- Usage metering (one credit per new question) ----

/** How many questions this user has used in the given period. */
export async function getUsage(q: Queryable, userId: number, periodKey: string): Promise<number> {
  const { rows } = await q.query(`SELECT count FROM usage_counters WHERE user_id = $1 AND period_key = $2`, [userId, periodKey]);
  return Number(rows[0]?.count || 0);
}

/**
 * Atomically charge one question against the period counter, never past the
 * limit. Returns the new count, or null when the limit is already reached.
 * The limit lives INSIDE the UPDATE's WHERE clause so two concurrent requests
 * can never both slip past a read-then-increment gap.
 */
export async function chargeUsage(
  q: Queryable,
  userId: number,
  periodKey: string,
  limit: number | null
): Promise<number | null> {
  // Make sure the period row exists (at 0), then charge with ONE conditional
  // UPDATE. Only the UPDATE mutates the count, so the limit check and the
  // increment are a single atomic statement on the real database. (Two steps
  // on purpose: pg-mem returns the EXISTING row for `ON CONFLICT DO NOTHING
  // RETURNING`, unlike real Postgres, so an upsert's result is ambiguous.)
  await q.query(
    `INSERT INTO usage_counters (user_id, period_key, count) VALUES ($1, $2, 0)
     ON CONFLICT (user_id, period_key) DO NOTHING`,
    [userId, periodKey]
  );
  const upd =
    limit == null
      ? await q.query(`UPDATE usage_counters SET count = count + 1 WHERE user_id = $1 AND period_key = $2 RETURNING count`, [userId, periodKey])
      : await q.query(
          `UPDATE usage_counters SET count = count + 1 WHERE user_id = $1 AND period_key = $2 AND count < $3 RETURNING count`,
          [userId, periodKey, limit]
        );
  return upd.rows[0] ? Number(upd.rows[0].count) : null;
}

/**
 * Run several statements as one transaction on a dedicated connection.
 * Used where partial completion would strand money (mark-paid + activate-plan
 * must land together). NOTE: the in-memory pg-mem dev fallback accepts but
 * IGNORES BEGIN/ROLLBACK, so callers that need dev-grade safety too should
 * pair this with an idempotent repair path (see billing.ts grantPass).
 */
export async function withTransaction<T>(fn: (tx: Queryable) => Promise<T>, p: any = pool): Promise<T> {
  if (p && typeof p.connect === "function") {
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* connection died mid-transaction: the server rolls back on its own */
      }
      throw e;
    } finally {
      client.release?.();
    }
  }
  return fn(p);
}

// ---- Payments + plan activation (Razorpay one-time pass) ----

export interface NewPayment {
  userId: number;
  plan: string;
  orderId: string;
  amount: number;
  currency: string;
}

export async function createPayment(q: Queryable, p: NewPayment): Promise<void> {
  await q.query(
    `INSERT INTO payments (user_id, plan, order_id, amount, currency, status)
     VALUES ($1,$2,$3,$4,$5,'created')`,
    [p.userId, p.plan, p.orderId, p.amount, p.currency]
  );
}

export async function getPaymentByOrderId(q: Queryable, orderId: string) {
  const { rows } = await q.query(`SELECT * FROM payments WHERE order_id = $1`, [orderId]);
  return rows[0] || null;
}

/**
 * Mark a payment paid. Returns the row ONLY on the first transition (status was
 * not already 'paid'), so callers activate the plan exactly once even if both
 * the client verify and the webhook fire for the same order.
 */
export async function markPaymentPaid(q: Queryable, orderId: string, paymentId: string) {
  const { rows } = await q.query(
    `UPDATE payments SET status = 'paid', payment_id = $2, updated_at = now()
     WHERE order_id = $1 AND status <> 'paid'
     RETURNING *`,
    [orderId, paymentId]
  );
  return rows[0] || null;
}

/**
 * Put the user on a paid plan for a fixed window (a 30-day one-time pass).
 * Buying a plan also ENDS the free trial permanently (clamped to the purchase
 * moment, never extended): once a student pays, the plan is their only quota,
 * and an expired pass never falls back onto leftover trial days.
 */
export async function activatePlan(
  q: Queryable,
  userId: number,
  plan: string,
  startedAtIso: string,
  expiresAtIso: string
) {
  const { rows } = await q.query(
    `UPDATE users SET plan = $2, plan_started_at = $3, plan_expires_at = $4,
       trial_ends_at = CASE WHEN trial_ends_at IS NULL OR trial_ends_at > now() THEN now() ELSE trial_ends_at END,
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [userId, plan, startedAtIso, expiresAtIso]
  );
  return rows[0] || null;
}

// ---- Partner referral codes ----

export interface NewReferralCode {
  code: string;
  partnerName: string;
  notes?: string;
  maxUses?: number | null;
}

export async function createReferralCode(q: Queryable, c: NewReferralCode) {
  const { rows } = await q.query(
    `INSERT INTO referral_codes (code, partner_name, notes, max_uses)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [c.code, c.partnerName, c.notes || "", c.maxUses ?? null]
  );
  return rows[0];
}

export async function getReferralCode(q: Queryable, code: string) {
  const { rows } = await q.query(`SELECT * FROM referral_codes WHERE code = $1`, [code]);
  return rows[0] || null;
}

export interface ReferralCodePatch {
  partnerName?: string;
  notes?: string;
  active?: boolean;
  /** undefined = leave as-is, null = clear the cap, number = set it. */
  maxUses?: number | null;
}

/** Partial update; only the fields present in the patch change. */
export async function updateReferralCode(q: Queryable, code: string, p: ReferralCodePatch) {
  const sets: string[] = [];
  const params: any[] = [code];
  const add = (fragment: string, value: any) => {
    params.push(value);
    sets.push(`${fragment} = $${params.length}`);
  };
  if (p.partnerName !== undefined) add("partner_name", p.partnerName);
  if (p.notes !== undefined) add("notes", p.notes);
  if (p.active !== undefined) add("active", p.active);
  if (p.maxUses !== undefined) add("max_uses", p.maxUses);
  if (!sets.length) return getReferralCode(q, code);
  const { rows } = await q.query(
    `UPDATE referral_codes SET ${sets.join(", ")}, updated_at = now() WHERE code = $1 RETURNING *`,
    params
  );
  return rows[0] || null;
}

/**
 * Atomically claim one use of a code. Same idiom as chargeUsage: the
 * active + cap check lives INSIDE the UPDATE's WHERE clause, so two concurrent
 * signups can never both slip past the last remaining slot. Returns the
 * updated row, or null when the code is missing, inactive, or full.
 */
export async function redeemReferralCode(q: Queryable, code: string) {
  const { rows } = await q.query(
    `UPDATE referral_codes SET use_count = use_count + 1, updated_at = now()
     WHERE code = $1 AND active = true AND (max_uses IS NULL OR use_count < max_uses)
     RETURNING *`,
    [code]
  );
  return rows[0] || null;
}

/** Hand a claimed use back (signup failed after the claim). Floors at 0. */
export async function releaseReferralCode(q: Queryable, code: string): Promise<void> {
  await q.query(
    `UPDATE referral_codes SET use_count = CASE WHEN use_count > 0 THEN use_count - 1 ELSE 0 END,
       updated_at = now()
     WHERE code = $1`,
    [code]
  );
}

export interface ReferralCodeStats {
  code: string;
  partnerName: string;
  notes: string;
  active: boolean;
  maxUses: number | null;
  useCount: number;
  /** Accounts attributed to this code (source of truth: users.referral_code). */
  signupCount: number;
  /** Attributed accounts that proved their email (filters scripted junk). */
  verifiedCount: number;
  /** Attributed accounts that have bought a pass at least once. */
  paidCount: number;
  createdAt: string;
}

/**
 * Every code with its attributed signup + paid counts. Two plain queries
 * merged in JS (no FILTER / correlated subqueries) so the exact same code
 * runs on real Postgres and the pg-mem dev/test fallback.
 */
export async function listReferralCodeStats(q: Queryable): Promise<ReferralCodeStats[]> {
  const { rows: codes } = await q.query(`SELECT * FROM referral_codes ORDER BY created_at DESC`);
  const { rows: counts } = await q.query(
    `SELECT referral_code, count(*) AS n
     FROM users WHERE referral_code IS NOT NULL GROUP BY referral_code`
  );
  const { rows: verified } = await q.query(
    `SELECT referral_code, count(*) AS n
     FROM users WHERE referral_code IS NOT NULL AND email_verified = true
     GROUP BY referral_code`
  );
  const { rows: paid } = await q.query(
    `SELECT referral_code, count(*) AS n
     FROM users WHERE referral_code IS NOT NULL AND plan_started_at IS NOT NULL
     GROUP BY referral_code`
  );
  const signupBy = new Map(counts.map((r: any) => [r.referral_code, Number(r.n)]));
  const verifiedBy = new Map(verified.map((r: any) => [r.referral_code, Number(r.n)]));
  const paidBy = new Map(paid.map((r: any) => [r.referral_code, Number(r.n)]));
  return codes.map((r: any) => ({
    code: r.code,
    partnerName: r.partner_name,
    notes: r.notes || "",
    active: r.active === true,
    maxUses: r.max_uses == null ? null : Number(r.max_uses),
    useCount: Number(r.use_count || 0),
    signupCount: signupBy.get(r.code) || 0,
    verifiedCount: verifiedBy.get(r.code) || 0,
    paidCount: paidBy.get(r.code) || 0,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/** The people behind a code: every account attributed to it, newest first. */
export async function referralSignups(q: Queryable, code: string, limit = 500) {
  const { rows } = await q.query(
    `SELECT id, email, name, board, grade, plan, plan_started_at, email_verified, created_at
     FROM users WHERE referral_code = $1
     ORDER BY created_at DESC LIMIT $2`,
    [code, limit]
  );
  return rows.map((r: any) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    board: r.board,
    grade: r.grade,
    plan: r.plan,
    emailVerified: r.email_verified === true,
    hasPaid: r.plan_started_at != null,
    signedUpAt: new Date(r.created_at).toISOString(),
  }));
}

// ---- Pre-exam notebook ----

export interface NotebookEntryInsert {
  id: string;
  userId: number;
  messageId: string | null;
  conversationId: string | null;
  question: string;
  text: string;
}

/** Save a selected snippet. Files under General/Unsorted until the classifier lands. */
export async function notebookInsert(q: Queryable, e: NotebookEntryInsert): Promise<void> {
  await q.query(
    `INSERT INTO notebook_entries (id, user_id, message_id, conversation_id, question, text)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [e.id, e.userId, e.messageId, e.conversationId, e.question, e.text]
  );
}

/** The async classifier files a saved point under its real subject/chapter. */
export async function notebookSetClassification(
  q: Queryable,
  userId: number,
  id: string,
  subject: string,
  chapter: string
): Promise<void> {
  await q.query(`UPDATE notebook_entries SET subject = $3, chapter = $4 WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
    subject,
    chapter,
  ]);
}

export async function notebookCount(q: Queryable, userId: number): Promise<number> {
  const { rows } = await q.query(`SELECT count(*) AS n FROM notebook_entries WHERE user_id = $1`, [userId]);
  return Number(rows[0]?.n || 0);
}

/** Distinct subject/chapter labels this student already has (keeps the AI's taxonomy stable). */
export async function notebookLabels(q: Queryable, userId: number): Promise<{ subject: string; chapter: string }[]> {
  const { rows } = await q.query(
    `SELECT DISTINCT subject, chapter FROM notebook_entries WHERE user_id = $1 LIMIT 100`,
    [userId]
  );
  return rows.map((r) => ({ subject: r.subject, chapter: r.chapter }));
}

/** Subjects -> chapters -> counts, for the notebook's shelf view. */
export async function notebookTree(
  q: Queryable,
  userId: number
): Promise<{ subject: string; chapter: string; count: number; latestAt: string }[]> {
  const { rows } = await q.query(
    `SELECT subject, chapter, count(*) AS n, max(created_at) AS latest
     FROM notebook_entries WHERE user_id = $1
     GROUP BY subject, chapter
     ORDER BY subject ASC, max(created_at) DESC`,
    [userId]
  );
  return rows.map((r) => ({
    subject: r.subject,
    chapter: r.chapter,
    count: Number(r.n),
    latestAt: new Date(r.latest).toISOString(),
  }));
}

/** Count + newest save time for one chapter: the Faheem-notes staleness key.
 *  A raw count (not a capped fetch length) so staleness can never pin "fresh". */
export async function notebookChapterStats(
  q: Queryable,
  userId: number,
  subject: string,
  chapter: string
): Promise<{ count: number; latestAtMs: number | null }> {
  const { rows } = await q.query(
    `SELECT count(*) AS n, max(created_at) AS latest FROM notebook_entries
     WHERE user_id = $1 AND subject = $2 AND chapter = $3`,
    [userId, subject, chapter]
  );
  const n = Number(rows[0]?.n || 0);
  return { count: n, latestAtMs: n > 0 && rows[0].latest ? new Date(rows[0].latest).getTime() : null };
}

export async function notebookEntriesFor(q: Queryable, userId: number, subject: string, chapter: string) {
  // LIMIT matches MAX_ENTRIES_PER_USER (2000), so a chapter can never hold
  // more rows than this fetch returns and no saved point is ever hidden.
  const { rows } = await q.query(
    `SELECT id, message_id, conversation_id, question, text, created_at
     FROM notebook_entries WHERE user_id = $1 AND subject = $2 AND chapter = $3
     ORDER BY created_at ASC LIMIT 2000`,
    [userId, subject, chapter]
  );
  return rows.map((r) => ({
    id: r.id,
    messageId: r.message_id,
    conversationId: r.conversation_id,
    question: r.question || "",
    text: r.text,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function notebookDeleteEntry(q: Queryable, userId: number, id: string): Promise<void> {
  await q.query(`DELETE FROM notebook_entries WHERE id = $2 AND user_id = $1`, [userId, id]);
}

export interface NotebookNote {
  text: string;
  entryCount: number;
  generatedAt: string;
}

export async function noteGet(q: Queryable, userId: number, subject: string, chapter: string): Promise<NotebookNote | null> {
  const { rows } = await q.query(
    `SELECT text, entry_count, generated_at FROM notebook_notes WHERE user_id = $1 AND subject = $2 AND chapter = $3`,
    [userId, subject, chapter]
  );
  if (!rows[0]) return null;
  return { text: rows[0].text, entryCount: Number(rows[0].entry_count), generatedAt: new Date(rows[0].generated_at).toISOString() };
}

export async function noteUpsert(
  q: Queryable,
  userId: number,
  subject: string,
  chapter: string,
  text: string,
  entryCount: number
): Promise<void> {
  await q.query(
    `INSERT INTO notebook_notes (user_id, subject, chapter, text, entry_count, generated_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (user_id, subject, chapter) DO UPDATE SET text = EXCLUDED.text, entry_count = EXCLUDED.entry_count, generated_at = now()`,
    [userId, subject, chapter, text, entryCount]
  );
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  role: string;
  text: string;
  mode?: string;
  sources?: { title: string; uri: string }[];
  attachments?: any[];
  /** For a deep-dive notebook: id of the answer whose "Go deeper" made it. */
  deepFor?: string;
}

export async function getMessages(q: Queryable, userId: number, conversationId: string, limit = 200) {
  const { rows } = await q.query(
    `SELECT id, role, text, mode, sources, attachments, deep_for, created_at
     FROM messages WHERE user_id = $1 AND conversation_id = $2 ORDER BY created_at ASC LIMIT $3`,
    [userId, conversationId, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    text: r.text,
    mode: r.mode || undefined,
    sources: r.sources || [],
    attachments: r.attachments || [],
    deepFor: r.deep_for || undefined,
    timestamp: new Date(r.created_at).toLocaleTimeString(),
  }));
}

export async function addMessage(q: Queryable, userId: number, m: StoredMessage) {
  // Upsert on id: re-saving an existing message updates its text and sources,
  // which is how a Deep-checked (examiner-corrected) answer replaces the
  // original in the study log. deep_for only ever backfills: an existing link
  // always wins (a re-save that omits it must not erase it), but a row whose
  // creating save lost the link (e.g. it was the deep-check re-save after the
  // real first save died on a flaky network) picks it up from any later save.
  await q.query(
    `INSERT INTO messages (id, user_id, conversation_id, role, text, mode, sources, attachments, deep_for)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text, sources = EXCLUDED.sources,
       deep_for = COALESCE(messages.deep_for, EXCLUDED.deep_for)`,
    [m.id, userId, m.conversationId, m.role, m.text, m.mode || null, JSON.stringify(m.sources || []), JSON.stringify(m.attachments || []), m.deepFor || null]
  );
  // Bump the conversation so the most recently used one floats to the top.
  await q.query(`UPDATE conversations SET updated_at = now() WHERE id = $1 AND user_id = $2`, [m.conversationId, userId]);
}

/**
 * Delete a single message the user owns. Used to unwind the optimistic save
 * when a question is blocked by the paywall, so no orphan question lingers in
 * the study log (an orphan would also make the next ask look like a follow-up).
 */
export async function deleteMessage(q: Queryable, userId: number, conversationId: string, messageId: string): Promise<void> {
  await q.query(`DELETE FROM messages WHERE id = $3 AND user_id = $1 AND conversation_id = $2`, [userId, conversationId, messageId]);
}

// ---- Conversations (separate chat windows) ----
export async function listConversations(q: Queryable, userId: number) {
  const { rows } = await q.query(
    `SELECT c.id, c.title, c.created_at, c.updated_at, count(m.id) AS message_count
     FROM conversations c
     LEFT JOIN messages m ON m.conversation_id = c.id
     WHERE c.user_id = $1
     GROUP BY c.id, c.title, c.created_at, c.updated_at
     ORDER BY c.updated_at DESC`,
    [userId]
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    messageCount: Number(r.message_count || 0),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

export async function createConversation(q: Queryable, userId: number, id: string, title = "New chat") {
  const { rows } = await q.query(
    `INSERT INTO conversations (id, user_id, title) VALUES ($1,$2,$3) RETURNING id, title, created_at, updated_at`,
    [id, userId, title]
  );
  const r = rows[0];
  return { id: r.id, title: r.title, messageCount: 0, updatedAt: new Date(r.updated_at).toISOString() };
}

export async function renameConversation(q: Queryable, userId: number, id: string, title: string) {
  await q.query(`UPDATE conversations SET title = $3 WHERE id = $1 AND user_id = $2`, [id, userId, title]);
}

export async function deleteConversation(q: Queryable, userId: number, id: string) {
  // Manual cascade (messages.conversation_id has no FK so it works on every engine).
  await q.query(`DELETE FROM messages WHERE user_id = $1 AND conversation_id = $2`, [userId, id]);
  await q.query(`DELETE FROM conversations WHERE id = $2 AND user_id = $1`, [userId, id]);
}

export async function conversationOwnedBy(q: Queryable, userId: number, id: string): Promise<boolean> {
  const { rows } = await q.query(`SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rows.length > 0;
}

/**
 * Make sure the user has at least one conversation, migrating any legacy
 * messages (saved before conversations existed) into a default one.
 */
export async function ensureDefaultConversation(q: Queryable, userId: number, newId: string): Promise<string> {
  const existing = await listConversations(q, userId);
  if (existing.length > 0) return existing[0].id;

  await createConversation(q, userId, newId, "My Study Log");
  // Adopt any orphaned messages from before this feature shipped.
  await q.query(`UPDATE messages SET conversation_id = $1 WHERE user_id = $2 AND conversation_id IS NULL`, [newId, userId]);
  return newId;
}

export interface CachedAnswer {
  text: string;
  sources: { title: string; uri: string }[];
  /** True when this answer has been through the deep-verify examiner pass. */
  verified: boolean;
}

export interface CacheFacets {
  mode: string;
  board?: string;
  grade?: string;
  language?: string;
  preferredAnalogy?: string;
}

/** Exact cache lookup by hashed key. */
export async function cacheGetByKey(q: Queryable, key: string): Promise<CachedAnswer | null> {
  const { rows } = await q.query(`SELECT text, sources, verified FROM explanation_cache WHERE cache_key = $1`, [key]);
  if (!rows[0]) return null;
  return { text: rows[0].text, sources: rows[0].sources || [], verified: rows[0].verified === true };
}

/** Candidate cache rows (same facets) for semantic (embedding) matching. */
export async function cacheCandidates(
  q: Queryable,
  f: CacheFacets
): Promise<{ cacheKey: string; embedding: number[] | null; text: string; sources: any[]; question: string; verified: boolean }[]> {
  const { rows } = await q.query(
    `SELECT cache_key, embedding, text, sources, question, verified FROM explanation_cache
     WHERE mode = $1 AND board = $2 AND grade = $3 AND language = $4 AND preferred_analogy = $5
       AND embedding IS NOT NULL
     LIMIT 300`,
    [f.mode, f.board ?? "", f.grade ?? "", f.language ?? "", f.preferredAnalogy ?? ""]
  );
  return rows.map((r) => ({
    cacheKey: r.cache_key,
    embedding: r.embedding,
    text: r.text,
    sources: r.sources || [],
    question: r.question || "",
    verified: r.verified === true,
  }));
}

export interface CacheUpsert extends CacheFacets {
  cacheKey: string;
  question: string;
  embedding: number[] | null;
  text: string;
  sources: any[];
  /** Whether the deep-verify examiner pass actually ran on this text. */
  verified?: boolean;
}

export async function cacheUpsertFull(q: Queryable, r: CacheUpsert): Promise<void> {
  await q.query(
    `INSERT INTO explanation_cache (cache_key, mode, board, grade, language, preferred_analogy, question, embedding, text, sources, verified)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (cache_key) DO UPDATE SET text = EXCLUDED.text, sources = EXCLUDED.sources, embedding = EXCLUDED.embedding, verified = EXCLUDED.verified`,
    [
      r.cacheKey,
      r.mode,
      r.board ?? "",
      r.grade ?? "",
      r.language ?? "",
      r.preferredAnalogy ?? "",
      r.question,
      r.embedding ? JSON.stringify(r.embedding) : null,
      r.text,
      JSON.stringify(r.sources || []),
      r.verified === true,
    ]
  );
}

/**
 * Upgrade a cache entry after a successful examiner pass on its text (the
 * examiner may also have corrected the answer, so the text is replaced too).
 */
export async function cacheMarkVerified(q: Queryable, cacheKey: string, text: string): Promise<void> {
  await q.query(`UPDATE explanation_cache SET text = $2, verified = TRUE WHERE cache_key = $1`, [cacheKey, text]);
}

// ---- Knowledge base (RAG) ----
export interface KnowledgeChunk {
  id: string;
  subject: string;
  topic: string;
  board: string;
  grade: string;
  content: string;
  embedding: number[];
}

export async function knowledgeCount(q: Queryable): Promise<number> {
  const { rows } = await q.query(`SELECT count(*) AS n FROM knowledge_chunks`);
  return Number(rows[0]?.n || 0);
}

export async function knowledgeInsert(q: Queryable, c: KnowledgeChunk): Promise<void> {
  await q.query(
    `INSERT INTO knowledge_chunks (id, subject, topic, board, grade, content, embedding)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
    [c.id, c.subject, c.topic, c.board, c.grade, c.content, JSON.stringify(c.embedding)]
  );
}

/** Ids already ingested, so startup can top up only the missing seed chunks. */
export async function knowledgeIds(q: Queryable): Promise<string[]> {
  const { rows } = await q.query(`SELECT id FROM knowledge_chunks`);
  return rows.map((r) => r.id);
}

export async function knowledgeAll(
  q: Queryable
): Promise<{ subject: string; topic: string; board: string; grade: string; content: string; embedding: number[] }[]> {
  const { rows } = await q.query(`SELECT subject, topic, board, grade, content, embedding FROM knowledge_chunks`);
  return rows.map((r) => ({
    subject: r.subject,
    topic: r.topic,
    board: r.board,
    grade: r.grade || "",
    content: r.content,
    embedding: r.embedding,
  }));
}

/** Purge the knowledge base (used when stored vectors no longer match the live embedding model). */
export async function knowledgeDeleteAll(q: Queryable): Promise<void> {
  await q.query(`DELETE FROM knowledge_chunks`);
}

/**
 * Null out cached-answer embeddings whose dimension doesn't match the live
 * embedding model. Mismatched vectors can never score above 0, so they only
 * waste candidate scans; the rows stay usable for exact-key lookups.
 */
export async function cacheClearMismatchedEmbeddings(q: Queryable, dims: number): Promise<void> {
  await q.query(
    `UPDATE explanation_cache SET embedding = NULL
     WHERE embedding IS NOT NULL AND jsonb_array_length(embedding) <> $1`,
    [dims]
  );
}

/**
 * Give one question credit back after a failed generation, never below zero.
 * A student must not pay for an answer that never arrived. (CASE instead of
 * GREATEST so the statement also runs on the pg-mem fallback.)
 */
export async function refundUsage(q: Queryable, userId: number, periodKey: string): Promise<void> {
  await q.query(
    `UPDATE usage_counters SET count = CASE WHEN count > 0 THEN count - 1 ELSE 0 END
     WHERE user_id = $1 AND period_key = $2`,
    [userId, periodKey]
  );
}

// ---- Landing Signal storage (see landing.ts recordLanding) ----------------

import crypto from "crypto";

export type LandingVerdict = "understood" | "partial" | "not_understood" | "unconfirmed";
export type ConceptState = "working_on_it" | "practiced" | "landed";

export interface LandingEvent {
  userId: number;
  conversationId: string | null;
  conceptKey: string;
  conceptLabel?: string | null;
  chapterTag?: string | null;
  triggerType: string;
  verdict: LandingVerdict;
  confidence: "high" | "medium" | "low";
  source: "tap" | "check" | "inferred" | "self_report";
}

/** Append one comprehension event (the honesty audit log). Never throws into
 *  the request path: a lost signal must never break a student's answer. */
export async function recordComprehensionEvent(q: Queryable, e: LandingEvent): Promise<void> {
  await q.query(
    `INSERT INTO comprehension_events
       (id, user_id, conversation_id, concept_key, concept_label, chapter_tag, trigger_type, verdict, confidence, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      `ce-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`,
      e.userId, e.conversationId, e.conceptKey, e.conceptLabel ?? null, e.chapterTag ?? null,
      e.triggerType, e.verdict, e.confidence, e.source,
    ]
  );
}

export interface ConceptMasteryRow {
  concept_key: string;
  concept_label: string | null;
  chapter_tag: string | null;
  state: ConceptState;
  probed_pass_count: number;
  struggle_count: number;
  inferred_pass_count: number;
  last_pass_at: string | null;
  last_verdict: string | null;
  first_seen_at: string | null;
  review_stage: number;
  next_review_at: string | null;
  canonical_key: string | null;
  last_seen_at: string;
}

const MASTERY_COLS = `concept_key, concept_label, chapter_tag, state, probed_pass_count, struggle_count,
            inferred_pass_count, last_pass_at, last_verdict, first_seen_at, review_stage, next_review_at,
            canonical_key, last_seen_at`;

export async function getConceptMastery(q: Queryable, userId: number, conceptKey: string): Promise<ConceptMasteryRow | null> {
  const { rows } = await q.query(
    `SELECT ${MASTERY_COLS} FROM concept_mastery WHERE user_id = $1 AND concept_key = $2`,
    [userId, conceptKey]
  );
  return (rows[0] as ConceptMasteryRow) || null;
}

export async function listConceptMastery(q: Queryable, userId: number): Promise<ConceptMasteryRow[]> {
  const { rows } = await q.query(
    `SELECT ${MASTERY_COLS} FROM concept_mastery WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 500`,
    [userId]
  );
  return rows as ConceptMasteryRow[];
}

/** Today's comprehension events (the session memory summary read). */
export async function listComprehensionEventsSince(
  q: Queryable,
  userId: number,
  sinceIso: string
): Promise<{ concept_key: string; concept_label: string | null; verdict: string; trigger_type: string }[]> {
  const { rows } = await q.query(
    `SELECT concept_key, concept_label, verdict, trigger_type
       FROM comprehension_events WHERE user_id = $1 AND created_at >= $2
       ORDER BY created_at ASC LIMIT 500`,
    [userId, sinceIso]
  );
  return rows as any[];
}

/** The global canonical-concept registry (see knowledge.ts canonicalizeConcept). */
export async function canonAll(
  q: Queryable
): Promise<{ canonical_key: string; label: string | null; embedding: number[] | null }[]> {
  const { rows } = await q.query(`SELECT canonical_key, label, embedding FROM concept_canon`);
  return rows.map((r: any) => ({
    canonical_key: r.canonical_key,
    label: r.label,
    embedding: typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding,
  }));
}

export async function canonInsert(
  q: Queryable,
  canonicalKey: string,
  label: string | null,
  embedding: number[] | null
): Promise<void> {
  await q.query(
    `INSERT INTO concept_canon (canonical_key, label, embedding) VALUES ($1, $2, $3)
     ON CONFLICT (canonical_key) DO NOTHING`,
    [canonicalKey, label, embedding ? JSON.stringify(embedding) : null]
  );
}

/** Upsert a concept's derived state. Callers pass the already-decided new
 *  state and the counter deltas; the honesty rules live in landing.ts. */
export async function upsertConceptMastery(
  q: Queryable,
  userId: number,
  conceptKey: string,
  patch: {
    conceptLabel?: string | null;
    chapterTag?: string | null;
    state?: ConceptState;
    lastVerdict?: LandingVerdict;
    incProbedPass?: number;
    incStruggle?: number;
    incInferredPass?: number;
    stampPassNow?: boolean;
    /** Forgetting curve: absolute retention stage (0..3). */
    reviewStage?: number;
    /** Forgetting curve: set next_review_at (ISO) or clear it (null). Omit to leave unchanged. */
    nextReviewAt?: string | null;
    /** Shadow canonical id (set once by the background canonicalizer). */
    canonicalKey?: string;
  }
): Promise<void> {
  // Ensure the row exists, then apply deltas in one conditional UPDATE.
  await q.query(
    `INSERT INTO concept_mastery (user_id, concept_key, concept_label, chapter_tag)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, concept_key) DO NOTHING`,
    [userId, conceptKey, patch.conceptLabel ?? null, patch.chapterTag ?? null]
  );
  await q.query(
    `UPDATE concept_mastery SET
       concept_label = COALESCE($3, concept_label),
       chapter_tag = COALESCE($4, chapter_tag),
       state = COALESCE($5, state),
       last_verdict = COALESCE($6, last_verdict),
       probed_pass_count = probed_pass_count + $7,
       struggle_count = struggle_count + $8,
       inferred_pass_count = inferred_pass_count + $9,
       last_pass_at = CASE WHEN $10 THEN now() ELSE last_pass_at END,
       review_stage = COALESCE($11, review_stage),
       next_review_at = CASE WHEN $12 THEN $13 ELSE next_review_at END,
       canonical_key = COALESCE($14, canonical_key),
       last_seen_at = now(),
       updated_at = now()
     WHERE user_id = $1 AND concept_key = $2`,
    [
      userId, conceptKey, patch.conceptLabel ?? null, patch.chapterTag ?? null,
      patch.state ?? null, patch.lastVerdict ?? null,
      patch.incProbedPass ?? 0, patch.incStruggle ?? 0, patch.incInferredPass ?? 0,
      patch.stampPassNow ? true : false,
      patch.reviewStage ?? null,
      patch.nextReviewAt !== undefined,
      patch.nextReviewAt ?? null,
      patch.canonicalKey ?? null,
    ]
  );
}
