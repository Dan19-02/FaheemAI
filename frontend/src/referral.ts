/**
 * Referral-code capture for partner links (https://faheem.ai/?ref=CODE).
 *
 * The app is router-free: the landing page swaps to the signup card without
 * navigating, and a shared phone might close and reopen the tab in between.
 * So the code is captured from the URL once at boot into localStorage, the
 * signup form prefills from there, and it is cleared the moment an account is
 * actually created with it (never on login: the next new student on the same
 * device may still be the partner's).
 */

const REF_KEY = "faheem_ref";
// Mirrors the backend's format guard (referral.ts CODE_RE).
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,30}[A-Z0-9]$/;

/** Same canonical spelling the backend uses: trim, uppercase, separators to dashes. */
export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s_]+/g, "-");
}

/** Read ?ref=CODE (partner links) from the current URL into localStorage. */
export function captureReferralFromUrl(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("ref") || params.get("referral") || "";
    const code = normalizeReferralCode(raw);
    if (code && CODE_RE.test(code)) localStorage.setItem(REF_KEY, code);
  } catch {
    /* malformed URL or storage unavailable: a missing prefill, nothing worse */
  }
}

/** The captured code, or "" when none is waiting. */
export function getCapturedReferral(): string {
  try {
    return localStorage.getItem(REF_KEY) || "";
  } catch {
    return "";
  }
}

/** Forget the captured code (called after a signup actually used it). */
export function clearCapturedReferral(): void {
  try {
    localStorage.removeItem(REF_KEY);
  } catch {
    /* ignore */
  }
}
