/**
 * Express app factory, split out of index.ts so tests can exercise every HTTP
 * route (with supertest + pg-mem) WITHOUT starting the listener. index.ts is
 * the only place that binds a port; the app built here is identical either way
 * (trust proxy, CORS, body-limit tiering, health route, routers).
 */
import express from "express";
import cors from "cors";
import { dbMode } from "./db.js";
import { authRouter } from "./auth.js";
import { aiRouter } from "./ai.js";
// FAHIM(v2): Razorpay billing is DORMANT (no monetization in the Bahrain pilot).
// Purchase routes and the webhook stay unmounted; only the READ surface below
// (plan catalogue + current entitlement) is live, because the plan chooser and
// the usage pill render from it. Re-mount billingRouter if monetization returns.
// import { billingRouter, razorpayWebhookHandler } from "./billing.js";
import { billingReadRouter } from "./billing.js";
import { notebookRouter } from "./notebook.js";
// FAHIM accuracy engine + curriculum (FR1). Public read + ask for the pilot.
import { curriculumRouter } from "./curriculum.js";
import { tutorRouter } from "./tutor.js";
import { breakerStates } from "./resilience.js";
import { requestLogger } from "./logger.js";

export function buildApp(): express.Express {
  const app = express();

  // Render terminates TLS at its proxy; trusting exactly one hop makes req.ip
  // the real client address, which the per-IP auth rate limits depend on.
  app.set("trust proxy", 1);

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
  // FAHIM(v2): Razorpay webhook unmounted (billing dormant). Was:
  // app.post("/api/billing/webhook", express.raw({ type: "*/*" }), razorpayWebhookHandler);

  app.use(requestLogger());

  // Body limits: only the image-carrying routes may send large payloads (base64
  // images / PDFs); everything else gets a tight default. The big parser is
  // mounted FIRST on explicit paths; express.json skips a body an earlier parser
  // already consumed, so the 1mb default never re-parses these routes.
  app.use(["/api/chat", "/api/chat/stream", "/api/tutor/ask"], express.json({ limit: "25mb" }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // db reports which engine is live ("postgres" | "memory") so a production
  // instance that silently lost its real database is detectable from outside;
  // the breaker states expose a provider outage the same way.
  app.get("/api/health", (_req, res) => res.json({ ok: true, db: dbMode, breakers: breakerStates() }));
  app.use("/api", authRouter);
  // FAHIM(v2): app.use("/api", billingRouter);  // purchases dormant, unmounted
  app.use("/api", billingReadRouter);
  app.use("/api", curriculumRouter);
  app.use("/api", tutorRouter);
  app.use("/api", notebookRouter);
  app.use("/api", aiRouter);

  return app;
}
