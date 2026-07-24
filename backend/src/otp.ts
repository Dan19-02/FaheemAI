/**
 * One-time-code crypto for email verification + password reset.
 *
 * The codes themselves are low-entropy (6 digits = 10^6), so the real defence is
 * upstream: short expiry + a hard per-code attempt cap + resend throttling + an
 * atomic check-and-consume (see db.verifyAuthCode). Here we only:
 *   - generate a CSPRNG 6-digit code (never Math.random),
 *   - store it as HMAC-SHA256(code, OTP_PEPPER) so a read-only DB leak cannot
 *     reverse a 6-digit space (a plain hash would be trivially precomputed),
 *   - compare in constant time.
 *
 * OTP_PEPPER is an app secret that lives in the environment, NOT the database,
 * so dumping auth_codes reveals no usable codes. If it is unset we fall back to
 * JWT_SECRET (already required in prod) with a warning, so nothing breaks in dev.
 */
import crypto from "crypto";

export const OTP_TTL_MIN = Math.max(1, Number(process.env.OTP_TTL_MIN) || 10);
export const OTP_MAX_ATTEMPTS = Math.max(1, Number(process.env.OTP_MAX_ATTEMPTS) || 5);
export const OTP_RESEND_COOLDOWN_SEC = Math.max(0, Number(process.env.OTP_RESEND_COOLDOWN_SEC) || 60);
/** Hard ceiling on codes issued to one address per purpose per rolling hour. */
export const OTP_MAX_PER_HOUR = Math.max(1, Number(process.env.OTP_MAX_PER_HOUR) || 5);

const PEPPER = process.env.OTP_PEPPER || process.env.JWT_SECRET || "dev-insecure-secret-change-me";
if (!process.env.OTP_PEPPER) {
  console.warn("[OTP] OTP_PEPPER not set; falling back to JWT_SECRET. Set a dedicated OTP_PEPPER before deploying.");
}

/** A fresh 6-digit numeric code, cryptographically random and zero-padded. */
export function generateOtp(): string {
  // randomInt is unbiased over [0, 1_000_000). Pad so "0042" style codes keep 6 digits.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/** HMAC-SHA256(code) with the server pepper, hex — what we persist. */
export function hashOtp(code: string): string {
  return crypto.createHmac("sha256", PEPPER).update(String(code)).digest("hex");
}

/** Constant-time compare of two equal-length hex digests. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export type OtpPurpose = "email_verify" | "password_reset";
