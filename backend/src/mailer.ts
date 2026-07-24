/**
 * Transactional email (the ONLY outbound message channel Faheem has).
 *
 * Provider-agnostic on purpose: everything goes through sendEmail(), which today
 * posts to Resend's REST API over plain fetch — the same no-SDK idiom the code
 * already uses for Kimi and Razorpay. Swapping to AWS SES (or SMTP) is a change
 * to THIS file only; nothing else imports a provider.
 *
 * Delivery is best-effort: a send failure must never break a signup or a reset
 * request. Callers fire-and-forget and we surface health via mailerStatus().
 *
 * SECURITY: the one-time code lives in the email body. It is NEVER written to a
 * log line in production. The dev fallback (no API key) prints the code to the
 * console ONLY when NODE_ENV !== 'production' so local dev needs no provider;
 * in production a missing key is a loud error, not a silent code leak.
 */
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_ENDPOINT = process.env.MAIL_API_URL || "https://api.resend.com/emails";
const MAIL_FROM = process.env.MAIL_FROM || "Faheem AI <no-reply@faheem.ai>";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@clarifyai.in";
const IS_PROD = process.env.NODE_ENV === "production";

if (!RESEND_API_KEY) {
  console.warn(
    IS_PROD
      ? "[Mailer] FATAL-ish: RESEND_API_KEY is not set in production. Verification and password-reset emails CANNOT be sent — set it before relying on account recovery."
      : "[Mailer] RESEND_API_KEY not set: dev mode will print codes to the console instead of emailing them."
  );
}

/** Lightweight health, surfaced by /api/health so a dead provider is visible. */
export const mailerStatus = { configured: Boolean(RESEND_API_KEY), sent: 0, failed: 0, lastError: "" as string };

interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Send one transactional email. Returns true on success. Never throws — the
 * caller (signup / forgot-password) treats email as best-effort.
 *
 * `codeForDevLog` is the raw OTP, passed ONLY so the dev fallback can print it
 * when there is no provider. It is never logged when a provider is configured
 * and never logged in production.
 */
export async function sendEmail(mail: Mail, codeForDevLog?: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    // No provider. Dev: print so the flow is testable. Prod: fail loud, no code.
    if (!IS_PROD && codeForDevLog) {
      console.log(`\n[Mailer:DEV] → ${mail.to}\n   ${mail.subject}\n   CODE: ${codeForDevLog}\n`);
      mailerStatus.sent++;
      return true;
    }
    mailerStatus.failed++;
    mailerStatus.lastError = "no RESEND_API_KEY";
    console.error(`[Mailer] cannot send "${mail.subject}" to a recipient: no RESEND_API_KEY configured.`);
    return false;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: MAIL_FROM, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text }),
    });
    if (!res.ok) {
      // Log status + recipient only — NEVER the body (it contains the code).
      const detail = await res.text().catch(() => "");
      mailerStatus.failed++;
      mailerStatus.lastError = `HTTP ${res.status}`;
      console.error(`[Mailer] provider rejected "${mail.subject}" (HTTP ${res.status}): ${detail.slice(0, 200)}`);
      return false;
    }
    mailerStatus.sent++;
    return true;
  } catch (e: any) {
    mailerStatus.failed++;
    mailerStatus.lastError = e?.message || "network";
    console.error(`[Mailer] send failed for "${mail.subject}": ${e?.message}`);
    return false;
  }
}

// ---- Templates -------------------------------------------------------------
// Plain English, short and warm: code, expiry, ignore-if-not-you.

const shell = (heading: string, lines: string[], code?: string) => {
  const codeBlock = code
    ? `<div style="font-size:30px;font-weight:700;letter-spacing:8px;text-align:center;margin:24px 0;color:#2f3b2f">${code}</div>`
    : "";
  const body = lines.map((l) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#3a3a3a">${l}</p>`).join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px">
    <h2 style="font-size:18px;color:#2f3b2f;margin:0 0 16px">${heading}</h2>
    ${body}${codeBlock}
    <p style="margin:20px 0 0;font-size:12px;color:#8a8a8a">Stuck? Write to <a href="mailto:${SUPPORT_EMAIL}" style="color:#5a6b5a">${SUPPORT_EMAIL}</a>.</p>
  </div>`;
};

export function sendVerifyCode(to: string, code: string, ttlMin: number): Promise<boolean> {
  const lines = [
    "Welcome to Faheem! Enter this code to verify your email. 🌱",
    `This code expires in ${ttlMin} minutes.`,
    "If you didn't create this account, you can ignore this email.",
  ];
  return sendEmail(
    { to, subject: `${code} is your Faheem verification code`, html: shell("Verify your email", lines, code), text: `Your Faheem verification code is ${code}. It expires in ${ttlMin} minutes. If you didn't create this account, ignore this email.` },
    code
  );
}

export function sendResetCode(to: string, code: string, ttlMin: number): Promise<boolean> {
  const lines = [
    "Enter this code to reset your Faheem password. 🌱",
    `This code expires in ${ttlMin} minutes.`,
    "If you didn't ask to reset your password, ignore this email — your account is safe.",
  ];
  return sendEmail(
    { to, subject: `${code} is your Faheem password reset code`, html: shell("Reset your password", lines, code), text: `Your Faheem password reset code is ${code}. It expires in ${ttlMin} minutes. If you didn't request this, ignore this email.` },
    code
  );
}

/** Sent when a forgot-password lands on a Google-only account (no password to
 *  reset). Keeps the endpoint enumeration-safe while steering the real owner. */
export function sendGoogleOnlyNotice(to: string): Promise<boolean> {
  const lines = [
    "You asked to reset your Faheem password, but this account signs in with Google — there's no password to reset.",
    "Just tap \"Continue with Google\" on the sign-in screen.",
  ];
  return sendEmail({ to, subject: "About your Faheem sign-in", html: shell("Use Continue with Google", lines), text: "This account signs in with Google — there is no password to reset. Use Continue with Google on the sign-in screen." });
}
