// Load env FIRST (before db/ai/auth modules read process.env at import time).
import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { initDb, dbMode } from "./db.js";
import { mailerStatus } from "./mailer.js";
import { authRouter } from "./auth.js";
import { aiRouter } from "./ai.js";
import { billingRouter, razorpayWebhookHandler } from "./billing.js";
import { notebookRouter } from "./notebook.js";
import { referralRouter } from "./referral.js";
import { ingestKnowledge } from "./knowledge.js";

// Process-level safety net. The known emitter crash source (the pg pool) is
// guarded at its source below; these keep any *other* stray rejection or
// emitter error from silently killing the whole server, which would drop
// every connected student. Log and keep serving rather than exiting.
process.on("unhandledRejection", (reason) => {
  console.error("[PROCESS] Unhandled promise rejection (server kept alive):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[PROCESS] Uncaught exception (server kept alive):", err);
});

const app = express();

// Behind Render's proxy the real client IP arrives in X-Forwarded-For. Trust
// exactly one hop so req.ip is the student, not the proxy, and the per-IP rate
// limits actually isolate clients instead of collapsing into one shared bucket.
// Hop count 1 (not `true`) so a client cannot spoof X-Forwarded-For to dodge limits.
app.set("trust proxy", 1);

// Security headers. This is a JSON API consumed cross-origin by the frontend,
// so CSP (a document-level control) and CORP (which would fight cross-origin
// API reads) are turned off; the still-valuable headers stay on: HSTS,
// X-Content-Type-Options: nosniff, X-Frame-Options: DENY, etc.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  })
);

// CORS_ORIGIN may be a single origin, a comma-separated list (apex + www +
// the Render preview URL), or "*". A list is matched exactly per request.
const corsOrigins = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: corsOrigins.includes("*")
      ? "*"
      : (origin, cb) => {
          // Allow same-origin / server-to-server (no Origin header) and any listed origin.
          if (!origin || corsOrigins.includes(origin)) return cb(null, true);
          return cb(new Error(`Origin ${origin} not allowed by CORS`));
        },
  })
);
// Razorpay webhook needs the raw bytes to verify its signature, so it is
// registered with a raw body parser BEFORE express.json() consumes the body.
app.post("/api/billing/webhook", express.raw({ type: "*/*" }), razorpayWebhookHandler);

// Body size: only the image-capable chat routes carry base64 photos (up to 6),
// so they keep a generous limit, and they sit behind requireAuth + per-user
// rate limiting. Every other route takes a tight 1mb cap to shrink the
// request-body DoS surface (a giant JSON blob no longer ties up the parser).
const imageJson = express.json({ limit: "25mb" });
const leanJson = express.json({ limit: "1mb" });
const IMAGE_ROUTES = new Set(["/api/chat", "/api/chat/stream"]);
app.use((req, res, next) =>
  (IMAGE_ROUTES.has(req.path) ? imageJson : leanJson)(req, res, next)
);
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// db reports which engine is live ("postgres" | "memory") so a production
// instance that silently lost its real database is detectable from outside.
app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    db: dbMode,
    // Email is the only channel for verification/reset; surface it so a dead or
    // unconfigured provider is detectable from outside (not just via tickets).
    mail: { configured: mailerStatus.configured, sent: mailerStatus.sent, failed: mailerStatus.failed, lastError: mailerStatus.lastError || undefined },
  })
);
app.use("/api", authRouter);
app.use("/api", billingRouter);
app.use("/api", notebookRouter);
app.use("/api", referralRouter);
app.use("/api", aiRouter);

const PORT = Number(process.env.PORT) || 4000;

// Fail CLOSED in production. Several secrets read at import fall back to an
// insecure default with only a console.warn, so a misconfigured deploy would
// boot green while serving forgeable tokens or an ephemeral in-memory database.
// Refuse to start instead. Dev and test keep their lenient fallbacks untouched.
const INSECURE_DEFAULT = "dev-insecure-secret-change-me";
function assertLaunchConfig() {
  if (process.env.NODE_ENV !== "production") return;
  const problems: string[] = [];
  const jwt = process.env.JWT_SECRET;
  if (!jwt || jwt === INSECURE_DEFAULT || jwt.length < 32) {
    problems.push("JWT_SECRET is unset, the insecure default, or under 32 chars — session tokens would be forgeable. Set a long random JWT_SECRET.");
  }
  if (!process.env.DATABASE_URL) {
    problems.push("DATABASE_URL is unset — the server would run an in-memory DB and lose every account and payment on restart. Set DATABASE_URL.");
  }
  const pepper = process.env.OTP_PEPPER || process.env.JWT_SECRET || INSECURE_DEFAULT;
  if (pepper === INSECURE_DEFAULT) {
    problems.push("OTP_PEPPER resolves to the insecure default — stored OTP hashes would be brute-forceable. Set OTP_PEPPER (or a strong JWT_SECRET).");
  }
  if (problems.length) {
    console.error(
      "[CONFIG] FATAL: refusing to start in production with an unsafe configuration:\n" +
        problems.map((p) => "  - " + p).join("\n")
    );
    process.exit(1);
  }
  // Launch-relevant, non-fatal.
  if ((process.env.CORS_ORIGIN || "*") === "*") {
    console.warn("[CONFIG] CORS_ORIGIN is '*' (any origin). Set it to your real frontend origin(s) in production.");
  }
  if (!process.env.GEMINI_API_KEY && !process.env.KIMI_API_KEY) {
    console.warn("[CONFIG] Neither GEMINI_API_KEY nor KIMI_API_KEY is set — answering will fail until one is configured.");
  }
}

async function start() {
  assertLaunchConfig();
  await initDb();

  app.listen(PORT, () => {
    console.log(`Faheem backend running on http://localhost:${PORT}`);
  });

  ingestKnowledge().catch((e) =>
    console.warn("[RAG] ingest error:", e.message)
  );
}

start().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
