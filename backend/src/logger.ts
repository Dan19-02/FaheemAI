/**
 * Structured logging without a dependency: one JSON object per line, so Render
 * (or any log shipper) can filter by level/field instead of grepping prose.
 * Deliberately tiny; if logging needs ever outgrow this, swap in pino behind
 * the same four functions.
 */
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...fields });
  if (level === "error" || level === "warn") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};

/**
 * Express middleware: stamp every request with an id and log method/path/
 * status/duration when the response finishes. The id rides on req so route
 * handlers can correlate their own logs with the request line.
 */
export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = crypto.randomUUID();
    (req as any).requestId = requestId;
    const t0 = Date.now();
    res.on("finish", () => {
      log.info("request", {
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - t0,
      });
    });
    next();
  };
}

/**
 * Log the real error server-side and answer the client with a generic message.
 * Raw provider/driver error text can carry hosts, model names, or key hints,
 * so err.message must never be returned in a 500 body.
 */
export function sendServerError(
  res: Response,
  err: unknown,
  context: string,
  publicMessage = "Something went wrong on our side. Please try again."
): void {
  log.error(context, { err: String((err as any)?.message || err) });
  if (!res.headersSent) {
    res.status(500).json({ error: publicMessage });
  }
}
