// Load env FIRST (before db/ai/auth modules read process.env at import time).
import "dotenv/config";

import http from "http";
import { initDb, dbMode, pool } from "./db.js";
import { buildApp } from "./app.js";
import { attachLiveWebSocket } from "./ai.js";
import { log } from "./logger.js";

// The full HTTP surface (CORS, body-limit tiering, health route, routers)
// lives in app.ts so tests can build the same app without a listener.
const app = buildApp();

const PORT = Number(process.env.PORT) || 4000;
const server = http.createServer(app);
attachLiveWebSocket(server);

async function start() {
  await initDb();

  server.listen(PORT, () => {
    log.info("Faheem backend running", { port: PORT, db: dbMode });
  });
}

start().catch((err) => {
  log.error("startup failed", { err: String(err?.message || err) });
  process.exit(1);
});

// Graceful shutdown: stop accepting connections, drain in-flight requests,
// end the pool best-effort. The forced-exit timer covers a wedged connection
// (an SSE stream that never closes) so a deploy can never hang indefinitely.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("shutting down", { signal });
  const force = setTimeout(() => {
    log.warn("forced exit: open connections did not drain in time");
    process.exit(1);
  }, 10_000);
  force.unref();
  server.close(() => {
    Promise.resolve(pool?.end?.())
      .catch(() => {})
      .finally(() => process.exit(0));
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
