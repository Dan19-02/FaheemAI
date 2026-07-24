/**
 * The curl-only operator guard shared by every admin surface (billing's comp
 * grant, referral codes). One secret (ADMIN_GRANT_TOKEN), one header
 * (x-admin-token), one timing-safe compare, one rate bucket: hardening or
 * instrumenting this file hardens every admin route at once, instead of two
 * hand-rolled guards drifting apart.
 */
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { rateLimit } from "./ai.js";

const ADMIN_TOKEN = process.env.ADMIN_GRANT_TOKEN || "";
if (!ADMIN_TOKEN) {
  console.warn("[Admin] ADMIN_GRANT_TOKEN not set: admin routes (billing grants, referral codes) are disabled until it is configured.");
}

/** Constant-time equality over sha256 digests, so neither length nor prefix
 *  of a guessed token leaks through response timing. */
function safeEqual(a: string, b: string): boolean {
  const da = crypto.createHash("sha256").update(a).digest();
  const db = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(da, db);
}

/** Express middleware: require the operator token in x-admin-token. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!ADMIN_TOKEN) {
    return res.status(503).json({ error: "The admin API is not configured on this server." });
  }
  // Brute-force brake on the shared secret itself.
  if (!rateLimit(`admin:ip:${req.ip}`, 30)) {
    return res.status(429).json({ error: "Too many requests. Try again in a minute." });
  }
  const supplied = String(req.headers["x-admin-token"] || "");
  if (!supplied || !safeEqual(supplied, ADMIN_TOKEN)) {
    return res.status(401).json({ error: "Not allowed." });
  }
  next();
}
