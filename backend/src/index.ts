// Load env FIRST (before db/ai/auth modules read process.env at import time).
import "dotenv/config";

import express from "express";
import cors from "cors";
import http from "http";
import { initDb, dbMode } from "./db.js";
import { authRouter } from "./auth.js";
import { aiRouter, attachLiveWebSocket } from "./ai.js";
// FAHIM(v2): Razorpay billing is DORMANT (no monetization in the Bahrain pilot).
// The billing module is kept in the tree but is NOT mounted, so /billing/* and the
// Razorpay webhook are off the critical path. Re-mount here if monetization returns.
// import { billingRouter, razorpayWebhookHandler } from "./billing.js";
import { notebookRouter } from "./notebook.js";
import { ingestKnowledge } from "./knowledge.js";
// FAHIM accuracy engine + curriculum (FR1). Public read + ask for the pilot.
import { curriculumRouter } from "./curriculum.js";
import { tutorRouter } from "./tutor.js";

const app = express();

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

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// db reports which engine is live ("postgres" | "memory") so a production
// instance that silently lost its real database is detectable from outside.
app.get("/api/health", (_req, res) => res.json({ ok: true, db: dbMode }));
app.use("/api", authRouter);
// FAHIM(v2): app.use("/api", billingRouter);  // billing dormant, unmounted
app.use("/api", curriculumRouter);
app.use("/api", tutorRouter);
app.use("/api", notebookRouter);
app.use("/api", aiRouter);

const PORT = Number(process.env.PORT) || 4000;
const server = http.createServer(app);
attachLiveWebSocket(server);

// await initDb();
// server.listen(PORT, () => console.log(`Clarify.AI backend running on http://localhost:${PORT}`));

// // Seed the RAG knowledge base in the background (doesn't block startup).
// ingestKnowledge().catch((e) => console.warn("[RAG] ingest error:", e.message));

async function start() {
  await initDb();

  server.listen(PORT, () => {
    console.log(`Clarify.AI backend running on http://localhost:${PORT}`);
  });

  ingestKnowledge().catch((e) =>
    console.warn("[RAG] ingest error:", e.message)
  );
}

start().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
