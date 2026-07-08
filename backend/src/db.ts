/**
 * PostgreSQL data layer.
 *
 * Every query function takes a `Queryable` (defaults to the shared pool) so the
 * exact same code can run against the real database in production and against an
 * in-memory Postgres (pg-mem) in tests.
 */
import fs from "fs";
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

/**
 * Resolve the pool's ssl option. Default stays `rejectUnauthorized: false`
 * (managed-Postgres CAs are not in Node's trust store, see stripSslParams
 * above), but an operator who downloads the provider's root certificate can
 * set PGSSLROOTCERT to its path and get full certificate verification.
 */
function resolveSsl(isLocal: boolean): false | Record<string, unknown> {
  if (process.env.PGSSL === "false" || isLocal) return false;
  const caPath = process.env.PGSSLROOTCERT;
  if (caPath) {
    try {
      return { ca: fs.readFileSync(caPath, "utf8"), rejectUnauthorized: true };
    } catch (e: any) {
      console.warn(`[DB] PGSSLROOTCERT is set but unreadable (${e.message}); falling back to unverified TLS.`);
    }
  }
  return { rejectUnauthorized: false };
}

export async function initDb(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const isLocal = /localhost|127\.0\.0\.1/.test(url);
    const connectionString = stripSslParams(url);
    const attempts = isLocal ? 1 : Math.max(1, Number(process.env.DB_CONNECT_ATTEMPTS) || 6);
    const connectTimeoutMs = Math.max(1_000, Number(process.env.DB_CONNECT_TIMEOUT_MS) || 15_000);
    const ssl = resolveSsl(isLocal);

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const candidate = new Pool({
        connectionString,
        ssl,
        connectionTimeoutMillis: connectTimeoutMs,
      });
      try {
        await candidate.query("SELECT 1");
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

  // Zero-setup in-memory fallback (data resets on restart). DEV ONLY.
  const { newDb } = await import("pg-mem");
  const PgMemPool = newDb().adapters.createPg().Pool;
  pool = new PgMemPool();
  await initSchema(pool);
  dbMode = "memory";
  console.warn("[DB] ⚠ Using IN-MEMORY database: data resets on restart. Set a real DATABASE_URL to persist.");
}

// New accounts start with an empty Chapter Mastery list (no demo/prefilled data).
export const DEFAULT_CHAPTERS: unknown[] = [];

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  -- Nullable: accounts created via "Continue with Google" have no password and
  -- are matched by google_sub (Google's stable per-user id) instead.
  password_hash TEXT,
  google_sub TEXT UNIQUE,
  name TEXT NOT NULL DEFAULT 'Student',
  board TEXT NOT NULL DEFAULT 'Bahrain MoE',
  grade TEXT NOT NULL DEFAULT 'Grade 10',
  language TEXT NOT NULL DEFAULT 'Arabic',
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-question usage counters. period_key is 'd:YYYY-MM-DD' for the daily trial
-- quota (reset midnight Bahrain time) or 'p:<pass-start-ms>' for a paid monthly
-- pass, so a fresh pass gets a fresh counter automatically.
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
  currency TEXT NOT NULL DEFAULT 'BHD',
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

-- Cached "Clarify notes": one AI-generated revision sheet per chapter, rebuilt
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

-- ===========================================================================
-- FAHIM curriculum spine.
--
-- One immutable surrogate key, unit_id (e.g. 'bh.g10.physics.u3'), is the join
-- key across grounding, notebook, and telemetry. It NEVER changes once minted;
-- textbook edition/section live in mutable attribute columns so a re-issue
-- updates attributes, not the key.
--
-- Enum-like columns (accuracy_type, gate_status, verification_outcome, ...) are
-- plain TEXT with allowed values documented in comments and enforced in app
-- code, matching the existing schema's convention (plan/role/status are all
-- plain TEXT). This keeps the in-memory pg-mem dev/test engine happy.
-- ===========================================================================

-- Subject registry. gate_status = the launch surface: the app serves only
-- rows where gate_status = 'live'. Allowed: 'draft' | 'in_review' | 'blocked'
-- | 'live'. accuracy_type: 'A' objective | 'B' language | 'C' interpretive |
-- 'D' sensitive/doctrinal. Enabling a subject is an UPDATE here, not a deploy.
CREATE TABLE IF NOT EXISTS curriculum_subjects (
  subject_id TEXT PRIMARY KEY,
  -- Board/curriculum this subject belongs to: 'moe' (Bahrain MoE), 'cbse',
  -- 'cambridge'. subject_id is board-qualified (e.g. 'cbse.physics') so the
  -- same subject name across boards never collides.
  board TEXT NOT NULL DEFAULT 'moe',
  name_ar TEXT NOT NULL DEFAULT '',
  name_en TEXT NOT NULL DEFAULT '',
  accuracy_type TEXT NOT NULL DEFAULT 'A',
  -- How well this subject can be grounded TODAY: 'textbook' (real textbook text
  -- ingested, e.g. NCERT), 'syllabus' (only outline/topics), 'proxy' (nearest
  -- documented grade used as a stand-in), 'structure' (system structure only).
  -- Confidence/sourcing surfacing reads this so we never imply textbook-true
  -- grounding we don't have.
  grounding_level TEXT NOT NULL DEFAULT 'syllabus',
  gate_status TEXT NOT NULL DEFAULT 'draft',
  correctness_bar NUMERIC,
  min_review_sample INTEGER NOT NULL DEFAULT 100,
  curriculum_version TEXT NOT NULL DEFAULT '',
  enabled_at TIMESTAMPTZ,
  enabled_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS curriculum_grades (
  grade_id TEXT PRIMARY KEY,
  board TEXT NOT NULL DEFAULT 'moe',
  label_ar TEXT NOT NULL DEFAULT '',
  label_en TEXT NOT NULL DEFAULT '',
  -- India Class 9-12 equivalent, so the three boards line up in the UI.
  india_equiv TEXT NOT NULL DEFAULT '',
  cycle TEXT NOT NULL DEFAULT ''
);

-- unit_id is the immutable join key used everywhere downstream. is_in_syllabus
-- lets a unit be marked out-of-scope without deleting it; enabled is the
-- per-unit go-live flag (a subject can be 'live' while some units are still dark).
CREATE TABLE IF NOT EXISTS curriculum_units (
  unit_id TEXT PRIMARY KEY,
  board TEXT NOT NULL DEFAULT 'moe',
  subject_id TEXT NOT NULL REFERENCES curriculum_subjects(subject_id) ON DELETE CASCADE,
  grade_id TEXT NOT NULL REFERENCES curriculum_grades(grade_id) ON DELETE CASCADE,
  seq INTEGER NOT NULL DEFAULT 0,
  title_ar TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL DEFAULT '',
  source_textbook TEXT NOT NULL DEFAULT '',
  source_edition TEXT NOT NULL DEFAULT '',
  curriculum_version TEXT NOT NULL DEFAULT '',
  is_in_syllabus BOOLEAN NOT NULL DEFAULT TRUE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_units_subject_grade ON curriculum_units(subject_id, grade_id, seq);

CREATE TABLE IF NOT EXISTS curriculum_objectives (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES curriculum_units(unit_id) ON DELETE CASCADE,
  seq INTEGER NOT NULL DEFAULT 0,
  text_ar TEXT NOT NULL DEFAULT '',
  text_en TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_objectives_unit ON curriculum_objectives(unit_id, seq);

-- Bilingual key terms: Arabic term + surfaced English technical term are DATA,
-- not prompt-glued, so term surfacing is consistent and reviewer-approved.
CREATE TABLE IF NOT EXISTS curriculum_key_terms (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES curriculum_units(unit_id) ON DELETE CASCADE,
  term_ar TEXT NOT NULL DEFAULT '',
  term_en TEXT NOT NULL DEFAULT '',
  definition_ar TEXT NOT NULL DEFAULT '',
  definition_en TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_key_terms_unit ON curriculum_key_terms(unit_id);

-- Provenance: which section/page a chunk came from, so the UI can show
-- "Unit 3 · Section 3.2" and cite a page span.
CREATE TABLE IF NOT EXISTS corpus_refs (
  ref_id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES curriculum_units(unit_id) ON DELETE CASCADE,
  section_label TEXT NOT NULL DEFAULT '',
  page_from INTEGER,
  page_to INTEGER,
  source_uri TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_corpus_refs_unit ON corpus_refs(unit_id);

-- The real MoE textbook corpus, chunked per section. Retrieval HARD-FILTERS by
-- unit_id first (never a whole-corpus scan), then ranks within that one unit.
-- embedding is JSONB + JS cosine for the single-subject pilot; migrate to
-- pgvector once the corpus grows past one subject (deferred, by decision).
-- content_display is verbatim (for citation); content_embed is the normalized
-- text actually embedded.
CREATE TABLE IF NOT EXISTS corpus_chunks (
  chunk_id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES curriculum_units(unit_id) ON DELETE CASCADE,
  ref_id TEXT,
  section_label TEXT NOT NULL DEFAULT '',
  content_display TEXT NOT NULL,
  content_embed TEXT NOT NULL DEFAULT '',
  embedding JSONB,
  token_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_corpus_chunks_unit ON corpus_chunks(unit_id);

-- ===========================================================================
-- Accuracy telemetry. One row per served answer, keyed on unit_id, holding NO
-- student free-text (minors / data-minimisation). This is how a subject earns
-- its go-live and how trust failures are caught upstream of a teacher report.
-- ===========================================================================
-- verification_outcome: 'verified' | 'corrected' | 'failed' | 'unavailable'
--   | 'not_applicable'. confidence: 'high' | 'medium' | 'low' | 'out_of_syllabus'.
CREATE TABLE IF NOT EXISTS accuracy_events (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  subject_id TEXT,
  unit_id TEXT,
  grade_id TEXT,
  language TEXT,
  accuracy_type TEXT,
  groundedness NUMERIC,
  verification_outcome TEXT,
  out_of_syllabus BOOLEAN NOT NULL DEFAULT FALSE,
  confidence TEXT,
  answer_hash TEXT,
  latency_ms INTEGER,
  cache_hit BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_accuracy_events_subject ON accuracy_events(subject_id, unit_id, created_at);

-- Human ground-truth: a teacher-reported error per subject+unit. status:
-- 'open' | 'triaged' | 'fixed' | 'rejected'.
CREATE TABLE IF NOT EXISTS teacher_reports (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reporter_id TEXT,
  reporter_role TEXT,
  subject_id TEXT,
  unit_id TEXT,
  message_id TEXT,
  error_type TEXT,
  severity TEXT,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS idx_teacher_reports_subject ON teacher_reports(subject_id, unit_id, created_at);
`;

export async function initSchema(q: Queryable = pool): Promise<void> {
  await q.query(SCHEMA_SQL);
  await runMigrations(q);
}

/**
 * Ordered, named migrations recorded in schema_migrations. Each step runs at
 * most once per database (a step marked `repeat` re-runs every boot: reserved
 * for idempotent data repairs, never schema changes). A step that fails for a
 * real reason CRASHES startup instead of being silently swallowed; only
 * "already exists" style errors are tolerated, for databases that predate the
 * ledger and already carry the columns.
 */
const MIGRATIONS: { name: string; sql: string; repeat?: boolean }[] = [
  { name: "001-messages-conversation-id", sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id TEXT` },
  { name: "002-messages-attachments", sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb` },
  { name: "003-cache-verified", sql: `ALTER TABLE explanation_cache ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE` },
  // Google sign-in: link accounts by Google's stable subject id, and let
  // Google-only accounts have no password.
  { name: "004-users-google-sub", sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT` },
  { name: "005-users-password-nullable", sql: `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL` },
  { name: "006-users-google-sub-index", sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL` },
  // Billing columns for accounts created before subscriptions shipped.
  { name: "007-users-plan", sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial'` },
  { name: "008-users-trial-ends-at", sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ` },
  { name: "009-users-plan-started-at", sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMPTZ` },
  { name: "010-users-plan-expires-at", sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ` },
  // Any account with a NULL trial gets a FRESH week from the day this runs,
  // honouring the "free while in early access" promise. `repeat` on purpose:
  // it is an idempotent data repair (the WHERE matches almost nothing after
  // the first pass) and must also catch rows a restore or manual edit left
  // NULL. New signups are unaffected (createUser stamps signup + 7 days).
  { name: "011-backfill-trial-ends-at", sql: `UPDATE users SET trial_ends_at = now() + interval '7 days' WHERE trial_ends_at IS NULL`, repeat: true },
  // FAHIM curriculum provenance. Attach the immutable unit_id + source/section
  // + confidence/verification/out-of-syllabus signals to every answer and saved
  // note. The old free-text subject/chapter columns STAY as a display cache so
  // the Arabic<->English render toggle never rewrites stored text.
  { name: "012-messages-unit-id", sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS unit_id TEXT` },
  { name: "013-messages-language", sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS language TEXT` },
  { name: "014-messages-source-section", sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS source_section TEXT` },
  { name: "015-messages-confidence", sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS confidence TEXT` },
  { name: "016-messages-groundedness", sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS groundedness NUMERIC` },
  { name: "017-messages-verification-outcome", sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS verification_outcome TEXT` },
  { name: "018-messages-out-of-syllabus", sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS out_of_syllabus BOOLEAN NOT NULL DEFAULT FALSE` },
  { name: "019-notebook-unit-id", sql: `ALTER TABLE notebook_entries ADD COLUMN IF NOT EXISTS unit_id TEXT` },
  { name: "020-notebook-language", sql: `ALTER TABLE notebook_entries ADD COLUMN IF NOT EXISTS language TEXT` },
  { name: "021-notebook-source-section", sql: `ALTER TABLE notebook_entries ADD COLUMN IF NOT EXISTS source_section TEXT` },
  { name: "022-notebook-confidence", sql: `ALTER TABLE notebook_entries ADD COLUMN IF NOT EXISTS confidence TEXT` },
  { name: "023-notebook-groundedness", sql: `ALTER TABLE notebook_entries ADD COLUMN IF NOT EXISTS groundedness NUMERIC` },
  { name: "024-notebook-verification-outcome", sql: `ALTER TABLE notebook_entries ADD COLUMN IF NOT EXISTS verification_outcome TEXT` },
  { name: "025-notebook-out-of-syllabus", sql: `ALTER TABLE notebook_entries ADD COLUMN IF NOT EXISTS out_of_syllabus BOOLEAN NOT NULL DEFAULT FALSE` },
  // Translated views for the language toggle: one row per (source text, target
  // language), keyed by content hash. Stored messages stay verbatim; this table
  // only caches the display-layer translation, shared across every student who
  // asks for the same answer in the other language.
  {
    name: "026-translations-table",
    sql: `CREATE TABLE IF NOT EXISTS translations (
      hash TEXT PRIMARY KEY,
      target TEXT NOT NULL,
      translated TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  },
];

/** The only error class a migration may survive: the object it creates is
 *  already there (legacy databases that predate the schema_migrations ledger). */
function isAlreadyExistsError(e: any): boolean {
  // 42701 duplicate_column, 42P07 duplicate_table, 42710 duplicate_object.
  if (e?.code === "42701" || e?.code === "42P07" || e?.code === "42710") return true;
  return /already exists/i.test(String(e?.message || e));
}

export async function runMigrations(q: Queryable = pool): Promise<void> {
  // Probe-then-create instead of a bare CREATE TABLE IF NOT EXISTS: pg-mem
  // (the dev/test engine) cannot re-run CREATE TABLE IF NOT EXISTS against an
  // existing table, while the probe works identically on both engines.
  try {
    await q.query(`SELECT 1 FROM schema_migrations LIMIT 1`);
  } catch {
    await q.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`
    );
  }
  const { rows } = await q.query(`SELECT name FROM schema_migrations`);
  const applied = new Set(rows.map((r) => r.name));

  for (const m of MIGRATIONS) {
    if (applied.has(m.name) && !m.repeat) continue;
    try {
      await q.query(m.sql);
    } catch (e: any) {
      if (!isAlreadyExistsError(e)) {
        console.error(`[DB] Migration ${m.name} failed: ${e?.message || e}`);
        throw e;
      }
    }
    await q.query(`INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [m.name]);
  }
}

/** Shape returned to the client (camelCase profile + chapters). */
export function rowToUser(row: any) {
  return {
    id: row.id,
    email: row.email,
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
}

// Every new account gets one free week from the moment they join. Kept in sync
// with subscription.ts TRIAL_DAYS (duplicated here to avoid an import cycle).
const SIGNUP_TRIAL_DAYS = 7;

export async function createUser(q: Queryable, u: NewUser) {
  const trialEndsAt = new Date(Date.now() + SIGNUP_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { rows } = await q.query(
    `INSERT INTO users (email, password_hash, name, board, grade, language, preferred_analogy, exam_goals, confidence_level, chapters, plan, trial_ends_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'trial',$11)
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
  const { rows } = await q.query(
    `UPDATE users SET google_sub = $2, updated_at = now() WHERE id = $1 RETURNING *`,
    [id, sub]
  );
  return rows[0] || null;
}

export interface NewGoogleUser {
  email: string;
  googleSub: string;
  name: string;
}

/** Create an account from a verified Google identity (no password). */
export async function createGoogleUser(q: Queryable, u: NewGoogleUser) {
  const trialEndsAt = new Date(Date.now() + SIGNUP_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { rows } = await q.query(
    `INSERT INTO users (email, password_hash, google_sub, name, board, grade, language, preferred_analogy, exam_goals, confidence_level, chapters, plan, trial_ends_at)
     VALUES ($1, NULL, $2, $3, 'Bahrain MoE', 'Grade 10', 'Arabic', 'Daily Life', '', 3, $4, 'trial', $5)
     RETURNING *`,
    [u.email.toLowerCase(), u.googleSub, u.name || "Student", JSON.stringify(DEFAULT_CHAPTERS), trialEndsAt]
  );
  return rows[0];
}

/**
 * Resolve a verified Google identity to a user row, creating or linking as
 * needed: match by google_sub first, then adopt an existing same-email account
 * (linking the two), otherwise create a fresh Google-only account.
 */
export async function findOrCreateGoogleUser(
  q: Queryable,
  g: { sub: string; email: string; name: string }
) {
  const bySub = await getUserByGoogleSub(q, g.sub);
  if (bySub) return bySub;

  const byEmail = await getUserByEmail(q, g.email);
  if (byEmail) {
    // Existing password account signing in with Google for the first time:
    // link them so both paths reach the same study log.
    return byEmail.google_sub ? byEmail : await linkGoogleSub(q, byEmail.id, g.sub);
  }

  return createGoogleUser(q, { email: g.email, googleSub: g.sub, name: g.name });
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

/** Count + newest save time for one chapter: the Clarify-notes staleness key.
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
}

export async function getMessages(q: Queryable, userId: number, conversationId: string, limit = 200) {
  const { rows } = await q.query(
    `SELECT id, role, text, mode, sources, attachments, created_at
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
    // Deterministic HH:MM regardless of the server's locale/timezone config,
    // so the same row never renders differently across deploys.
    timestamp: new Date(r.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  }));
}

export async function addMessage(q: Queryable, userId: number, m: StoredMessage) {
  // Upsert on id: re-saving an existing message updates its text and sources,
  // which is how a Deep-checked (examiner-corrected) answer replaces the
  // original in the study log. The WHERE clause makes the update owner-scoped:
  // message ids are client-minted, so without it any user could overwrite
  // another user's message by guessing its id.
  await q.query(
    `INSERT INTO messages (id, user_id, conversation_id, role, text, mode, sources, attachments)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text, sources = EXCLUDED.sources
     WHERE messages.user_id = EXCLUDED.user_id`,
    [m.id, userId, m.conversationId, m.role, m.text, m.mode || null, JSON.stringify(m.sources || []), JSON.stringify(m.attachments || [])]
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

// ===========================================================================
// FAHIM curriculum spine + telemetry.
//
// These back the accuracy engine, FR1 context selection, and the per-subject
// validation gate. Sprint 1 lands the data layer; the chat path wires into it
// in later phases. Nothing here is on the student critical path yet.
// ===========================================================================

// ---- Subjects (the launch surface) ----

export interface CurriculumSubject {
  subjectId: string;
  board: string;
  nameAr: string;
  nameEn: string;
  /** 'A' objective | 'B' language | 'C' interpretive | 'D' sensitive/doctrinal. */
  accuracyType: string;
  /** 'textbook' | 'syllabus' | 'proxy' | 'structure': how deep grounding can go. */
  groundingLevel: string;
  /** 'draft' | 'in_review' | 'blocked' | 'live'. Only 'live' is served to students. */
  gateStatus: string;
  correctnessBar: number | null;
  minReviewSample: number;
  curriculumVersion: string;
}

function rowToSubject(r: any): CurriculumSubject {
  return {
    subjectId: r.subject_id,
    board: r.board || "moe",
    nameAr: r.name_ar,
    nameEn: r.name_en,
    accuracyType: r.accuracy_type,
    groundingLevel: r.grounding_level || "syllabus",
    gateStatus: r.gate_status,
    correctnessBar: r.correctness_bar == null ? null : Number(r.correctness_bar),
    minReviewSample: Number(r.min_review_sample || 0),
    curriculumVersion: r.curriculum_version || "",
  };
}

/** Create or update a subject. Deliberately does NOT touch gate_status on
 *  conflict, so re-running a seed can never silently un-launch a live subject
 *  (gate changes go through setSubjectGateStatus, an explicit review action). */
export async function upsertSubject(
  q: Queryable,
  s: {
    subjectId: string;
    board: string;
    nameAr: string;
    nameEn: string;
    accuracyType: string;
    groundingLevel?: string;
    gateStatus?: string;
    correctnessBar?: number | null;
    minReviewSample?: number;
    curriculumVersion?: string;
  }
): Promise<void> {
  await q.query(
    `INSERT INTO curriculum_subjects
       (subject_id, board, name_ar, name_en, accuracy_type, grounding_level, gate_status, correctness_bar, min_review_sample, curriculum_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (subject_id) DO UPDATE SET
       board = EXCLUDED.board,
       name_ar = EXCLUDED.name_ar,
       name_en = EXCLUDED.name_en,
       accuracy_type = EXCLUDED.accuracy_type,
       grounding_level = EXCLUDED.grounding_level,
       correctness_bar = EXCLUDED.correctness_bar,
       min_review_sample = EXCLUDED.min_review_sample,
       curriculum_version = EXCLUDED.curriculum_version`,
    [
      s.subjectId,
      s.board,
      s.nameAr,
      s.nameEn,
      s.accuracyType,
      s.groundingLevel ?? "syllabus",
      s.gateStatus ?? "draft",
      s.correctnessBar ?? null,
      s.minReviewSample ?? 100,
      s.curriculumVersion ?? "",
    ]
  );
}

/** All subjects for a board (or every subject if board omitted), for ops/authoring. */
export async function listSubjects(q: Queryable, board?: string): Promise<CurriculumSubject[]> {
  const { rows } = board
    ? await q.query(`SELECT * FROM curriculum_subjects WHERE board = $1 ORDER BY subject_id`, [board])
    : await q.query(`SELECT * FROM curriculum_subjects ORDER BY board, subject_id`);
  return rows.map(rowToSubject);
}

/** Flip a subject's gate status. Setting 'live' stamps who/when. This is the
 *  entire "enable a subject" action: a data + review step, not a code deploy. */
export async function setSubjectGateStatus(
  q: Queryable,
  subjectId: string,
  gateStatus: string,
  enabledBy?: string
): Promise<void> {
  await q.query(
    `UPDATE curriculum_subjects
       SET gate_status = $2,
           enabled_at = CASE WHEN $2 = 'live' THEN now() ELSE enabled_at END,
           enabled_by = COALESCE($3, enabled_by)
     WHERE subject_id = $1`,
    [subjectId, gateStatus, enabledBy ?? null]
  );
}

/** Update how deeply a subject can be grounded (set 'textbook' once real
 *  textbook corpus is ingested for it). Drives honest confidence surfacing. */
export async function setSubjectGrounding(q: Queryable, subjectId: string, level: string): Promise<void> {
  await q.query(`UPDATE curriculum_subjects SET grounding_level = $2 WHERE subject_id = $1`, [subjectId, level]);
}

export async function getSubject(q: Queryable, subjectId: string): Promise<CurriculumSubject | null> {
  const { rows } = await q.query(`SELECT * FROM curriculum_subjects WHERE subject_id = $1`, [subjectId]);
  return rows[0] ? rowToSubject(rows[0]) : null;
}

/** The launch surface: only subjects that have passed their gate. */
export async function listLiveSubjects(q: Queryable): Promise<CurriculumSubject[]> {
  const { rows } = await q.query(`SELECT * FROM curriculum_subjects WHERE gate_status = 'live' ORDER BY subject_id`);
  return rows.map(rowToSubject);
}

// ---- Grades ----

export async function upsertGrade(
  q: Queryable,
  g: { gradeId: string; board: string; labelAr: string; labelEn: string; indiaEquiv?: string; cycle?: string }
): Promise<void> {
  await q.query(
    `INSERT INTO curriculum_grades (grade_id, board, label_ar, label_en, india_equiv, cycle)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (grade_id) DO UPDATE SET
       board = EXCLUDED.board, label_ar = EXCLUDED.label_ar, label_en = EXCLUDED.label_en,
       india_equiv = EXCLUDED.india_equiv, cycle = EXCLUDED.cycle`,
    [g.gradeId, g.board, g.labelAr, g.labelEn, g.indiaEquiv ?? "", g.cycle ?? ""]
  );
}

/** Grades for a board, ordered by India-equivalent so the three boards line up. */
export async function listGrades(q: Queryable, board?: string): Promise<{ gradeId: string; board: string; labelEn: string; labelAr: string; indiaEquiv: string }[]> {
  const { rows } = board
    ? await q.query(`SELECT * FROM curriculum_grades WHERE board = $1 ORDER BY india_equiv, grade_id`, [board])
    : await q.query(`SELECT * FROM curriculum_grades ORDER BY board, india_equiv, grade_id`);
  return rows.map((r) => ({ gradeId: r.grade_id, board: r.board || "moe", labelEn: r.label_en, labelAr: r.label_ar, indiaEquiv: r.india_equiv || "" }));
}

// ---- Units (the immutable unit_id join key) ----

export interface CurriculumUnit {
  unitId: string;
  board: string;
  subjectId: string;
  gradeId: string;
  seq: number;
  titleAr: string;
  titleEn: string;
  sourceTextbook: string;
  sourceEdition: string;
  curriculumVersion: string;
  isInSyllabus: boolean;
  enabled: boolean;
}

function rowToUnit(r: any): CurriculumUnit {
  return {
    unitId: r.unit_id,
    board: r.board || "moe",
    subjectId: r.subject_id,
    gradeId: r.grade_id,
    seq: Number(r.seq || 0),
    titleAr: r.title_ar,
    titleEn: r.title_en,
    sourceTextbook: r.source_textbook || "",
    sourceEdition: r.source_edition || "",
    curriculumVersion: r.curriculum_version || "",
    isInSyllabus: r.is_in_syllabus !== false,
    enabled: r.enabled === true,
  };
}

/** Create or update a unit. `enabled` is NOT overwritten on conflict (per-unit
 *  go-live is controlled by setUnitEnabled), so re-seeding is safe. */
export async function upsertUnit(
  q: Queryable,
  u: {
    unitId: string;
    board: string;
    subjectId: string;
    gradeId: string;
    seq: number;
    titleAr: string;
    titleEn: string;
    sourceTextbook?: string;
    sourceEdition?: string;
    curriculumVersion?: string;
    isInSyllabus?: boolean;
  }
): Promise<void> {
  await q.query(
    `INSERT INTO curriculum_units
       (unit_id, board, subject_id, grade_id, seq, title_ar, title_en, source_textbook, source_edition, curriculum_version, is_in_syllabus)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (unit_id) DO UPDATE SET
       board = EXCLUDED.board,
       subject_id = EXCLUDED.subject_id,
       grade_id = EXCLUDED.grade_id,
       seq = EXCLUDED.seq,
       title_ar = EXCLUDED.title_ar,
       title_en = EXCLUDED.title_en,
       source_textbook = EXCLUDED.source_textbook,
       source_edition = EXCLUDED.source_edition,
       curriculum_version = EXCLUDED.curriculum_version,
       is_in_syllabus = EXCLUDED.is_in_syllabus`,
    [
      u.unitId,
      u.board,
      u.subjectId,
      u.gradeId,
      u.seq,
      u.titleAr,
      u.titleEn,
      u.sourceTextbook ?? "",
      u.sourceEdition ?? "",
      u.curriculumVersion ?? "",
      u.isInSyllabus ?? true,
    ]
  );
}

export async function setUnitEnabled(q: Queryable, unitId: string, enabled: boolean): Promise<void> {
  await q.query(`UPDATE curriculum_units SET enabled = $2 WHERE unit_id = $1`, [unitId, enabled]);
}

export async function getUnit(q: Queryable, unitId: string): Promise<CurriculumUnit | null> {
  const { rows } = await q.query(`SELECT * FROM curriculum_units WHERE unit_id = $1`, [unitId]);
  return rows[0] ? rowToUnit(rows[0]) : null;
}

/**
 * Units for a subject+grade, ordered by sequence. FR1 reads this to build the
 * unit picker; pass enabledOnly for the student-facing list (only enabled,
 * in-syllabus units), and the full list for authoring/ops.
 */
export async function listUnits(
  q: Queryable,
  subjectId: string,
  gradeId: string,
  opts: { enabledOnly?: boolean } = {}
): Promise<CurriculumUnit[]> {
  const where = opts.enabledOnly
    ? `subject_id = $1 AND grade_id = $2 AND enabled = TRUE AND is_in_syllabus = TRUE`
    : `subject_id = $1 AND grade_id = $2`;
  const { rows } = await q.query(`SELECT * FROM curriculum_units WHERE ${where} ORDER BY seq ASC`, [subjectId, gradeId]);
  return rows.map(rowToUnit);
}

// ---- Objectives & bilingual key terms ----

export async function insertObjective(
  q: Queryable,
  o: { id: string; unitId: string; seq: number; textAr: string; textEn: string }
): Promise<void> {
  await q.query(
    `INSERT INTO curriculum_objectives (id, unit_id, seq, text_ar, text_en)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO UPDATE SET seq = EXCLUDED.seq, text_ar = EXCLUDED.text_ar, text_en = EXCLUDED.text_en`,
    [o.id, o.unitId, o.seq, o.textAr, o.textEn]
  );
}

export async function objectivesForUnit(q: Queryable, unitId: string): Promise<{ textAr: string; textEn: string }[]> {
  const { rows } = await q.query(`SELECT text_ar, text_en FROM curriculum_objectives WHERE unit_id = $1 ORDER BY seq ASC`, [unitId]);
  return rows.map((r) => ({ textAr: r.text_ar, textEn: r.text_en }));
}

export async function insertKeyTerm(
  q: Queryable,
  t: { id: string; unitId: string; termAr: string; termEn: string; definitionAr?: string; definitionEn?: string }
): Promise<void> {
  await q.query(
    `INSERT INTO curriculum_key_terms (id, unit_id, term_ar, term_en, definition_ar, definition_en)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET
       term_ar = EXCLUDED.term_ar, term_en = EXCLUDED.term_en,
       definition_ar = EXCLUDED.definition_ar, definition_en = EXCLUDED.definition_en`,
    [t.id, t.unitId, t.termAr, t.termEn, t.definitionAr ?? "", t.definitionEn ?? ""]
  );
}

export async function keyTermsForUnit(
  q: Queryable,
  unitId: string
): Promise<{ termAr: string; termEn: string; definitionAr: string; definitionEn: string }[]> {
  const { rows } = await q.query(
    `SELECT term_ar, term_en, definition_ar, definition_en FROM curriculum_key_terms WHERE unit_id = $1`,
    [unitId]
  );
  return rows.map((r) => ({ termAr: r.term_ar, termEn: r.term_en, definitionAr: r.definition_ar, definitionEn: r.definition_en }));
}

// ---- Corpus (the real MoE content, retrieved by unit_id hard filter) ----

export async function insertCorpusRef(
  q: Queryable,
  r: { refId: string; unitId: string; sectionLabel: string; pageFrom?: number | null; pageTo?: number | null; sourceUri?: string }
): Promise<void> {
  await q.query(
    `INSERT INTO corpus_refs (ref_id, unit_id, section_label, page_from, page_to, source_uri)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (ref_id) DO UPDATE SET
       section_label = EXCLUDED.section_label, page_from = EXCLUDED.page_from,
       page_to = EXCLUDED.page_to, source_uri = EXCLUDED.source_uri`,
    [r.refId, r.unitId, r.sectionLabel, r.pageFrom ?? null, r.pageTo ?? null, r.sourceUri ?? ""]
  );
}

export interface CorpusChunk {
  chunkId: string;
  unitId: string;
  refId: string | null;
  sectionLabel: string;
  contentDisplay: string;
  contentEmbed: string;
  embedding: number[] | null;
  tokenCount: number;
}

export async function insertCorpusChunk(q: Queryable, c: CorpusChunk): Promise<void> {
  await q.query(
    `INSERT INTO corpus_chunks (chunk_id, unit_id, ref_id, section_label, content_display, content_embed, embedding, token_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (chunk_id) DO UPDATE SET
       ref_id = EXCLUDED.ref_id, section_label = EXCLUDED.section_label,
       content_display = EXCLUDED.content_display, content_embed = EXCLUDED.content_embed,
       embedding = EXCLUDED.embedding, token_count = EXCLUDED.token_count`,
    [
      c.chunkId,
      c.unitId,
      c.refId,
      c.sectionLabel,
      c.contentDisplay,
      c.contentEmbed,
      c.embedding ? JSON.stringify(c.embedding) : null,
      c.tokenCount,
    ]
  );
}

/** The hard pre-filter: every chunk for ONE unit. Retrieval ranks within this,
 *  never across the whole corpus, which is what makes grounding curriculum-true
 *  and out-of-syllabus detection nearly free. */
export async function corpusChunksForUnit(q: Queryable, unitId: string): Promise<CorpusChunk[]> {
  const { rows } = await q.query(
    `SELECT chunk_id, unit_id, ref_id, section_label, content_display, content_embed, embedding, token_count
     FROM corpus_chunks WHERE unit_id = $1`,
    [unitId]
  );
  return rows.map((r) => ({
    chunkId: r.chunk_id,
    unitId: r.unit_id,
    refId: r.ref_id || null,
    sectionLabel: r.section_label || "",
    contentDisplay: r.content_display,
    contentEmbed: r.content_embed || "",
    embedding: Array.isArray(r.embedding) ? r.embedding : null,
    tokenCount: Number(r.token_count || 0),
  }));
}

export async function corpusChunkCountForUnit(q: Queryable, unitId: string): Promise<number> {
  const { rows } = await q.query(`SELECT count(*) AS n FROM corpus_chunks WHERE unit_id = $1`, [unitId]);
  return Number(rows[0]?.n || 0);
}

/** All corpus chunks for a whole board+grade (across every unit), each carrying
 *  its unit title. This is how the chat flow resolves subject+unit SERVER-SIDE:
 *  the student just asks, and retrieval finds the best-matching unit's content. */
export async function corpusChunksForBoardGrade(
  q: Queryable,
  board: string,
  gradeId: string
): Promise<(CorpusChunk & { unitTitle: string })[]> {
  const { rows } = await q.query(
    `SELECT c.chunk_id, c.unit_id, c.ref_id, c.section_label, c.content_display, c.content_embed, c.embedding, c.token_count,
            u.title_en AS unit_title
     FROM corpus_chunks c JOIN curriculum_units u ON u.unit_id = c.unit_id
     WHERE u.board = $1 AND u.grade_id = $2`,
    [board, gradeId]
  );
  return rows.map((r) => ({
    chunkId: r.chunk_id,
    unitId: r.unit_id,
    refId: r.ref_id || null,
    sectionLabel: r.section_label || "",
    contentDisplay: r.content_display,
    contentEmbed: r.content_embed || "",
    embedding: Array.isArray(r.embedding) ? r.embedding : null,
    tokenCount: Number(r.token_count || 0),
    unitTitle: r.unit_title || "",
  }));
}

// ---- Accuracy telemetry ----

export interface AccuracyEventInsert {
  id: string;
  subjectId?: string | null;
  unitId?: string | null;
  gradeId?: string | null;
  language?: string | null;
  accuracyType?: string | null;
  groundedness?: number | null;
  verificationOutcome?: string | null;
  outOfSyllabus?: boolean;
  confidence?: string | null;
  answerHash?: string | null;
  latencyMs?: number | null;
  cacheHit?: boolean;
}

/** One row per served answer. Holds NO student free-text (minors / minimisation);
 *  answerHash is a hash of the answer, not the answer itself. */
export async function insertAccuracyEvent(q: Queryable, e: AccuracyEventInsert): Promise<void> {
  await q.query(
    `INSERT INTO accuracy_events
       (id, subject_id, unit_id, grade_id, language, accuracy_type, groundedness, verification_outcome, out_of_syllabus, confidence, answer_hash, latency_ms, cache_hit)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      e.id,
      e.subjectId ?? null,
      e.unitId ?? null,
      e.gradeId ?? null,
      e.language ?? null,
      e.accuracyType ?? null,
      e.groundedness ?? null,
      e.verificationOutcome ?? null,
      e.outOfSyllabus ?? false,
      e.confidence ?? null,
      e.answerHash ?? null,
      e.latencyMs ?? null,
      e.cacheHit ?? false,
    ]
  );
}

export interface TeacherReportInsert {
  id: string;
  reporterId?: string | null;
  reporterRole?: string | null;
  subjectId?: string | null;
  unitId?: string | null;
  messageId?: string | null;
  errorType?: string | null;
  severity?: string | null;
  note?: string;
}

export async function insertTeacherReport(q: Queryable, r: TeacherReportInsert): Promise<void> {
  await q.query(
    `INSERT INTO teacher_reports
       (id, reporter_id, reporter_role, subject_id, unit_id, message_id, error_type, severity, note, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open')`,
    [
      r.id,
      r.reporterId ?? null,
      r.reporterRole ?? null,
      r.subjectId ?? null,
      r.unitId ?? null,
      r.messageId ?? null,
      r.errorType ?? null,
      r.severity ?? null,
      r.note ?? "",
    ]
  );
}

// ---- Translated views (the language toggle) ----

/** Batch-read cached translations by content hash. */
export async function translationsGet(q: Queryable, hashes: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (hashes.length === 0) return out;
  const params = hashes.map((_, i) => `$${i + 1}`).join(",");
  const { rows } = await q.query(`SELECT hash, translated FROM translations WHERE hash IN (${params})`, hashes);
  for (const r of rows) out.set(r.hash, r.translated);
  return out;
}

/** Cache one translation. First write wins: translations are deterministic
 *  enough that racing writers would store near-identical text anyway. */
export async function translationPut(q: Queryable, hash: string, target: string, translated: string): Promise<void> {
  await q.query(
    `INSERT INTO translations (hash, target, translated) VALUES ($1,$2,$3)
     ON CONFLICT (hash) DO NOTHING`,
    [hash, target, translated]
  );
}
