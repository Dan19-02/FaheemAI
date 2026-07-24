/**
 * Login / Sign-up screen (email + password, JWT auth).
 * Sign-up collects the full student profile in one go; everything is editable
 * later in Study Preferences. Mobile-first, editorial theme.
 *
 * Also hosts the password-reset flow as two extra internal modes ("forgot" →
 * "reset"), so the router-free app needs no new screen wiring: Landing still
 * only knows "login" | "signup", and everything else lives in this one card.
 */
import React, { useEffect, useRef, useState } from "react";
import { GraduationCap, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "./AuthContext";
import { useGoogleButton } from "./googleSignIn";
import { SUPPORT_EMAIL } from "./defaults";
import { api } from "./api";
import OtpInput from "./OtpInput";
import { getCapturedReferral, clearCapturedReferral, normalizeReferralCode } from "./referral";

// Must match the backend syllabus corpus board names exactly
// (backend/src/data/syllabusCorpus.ts): the RAG retrieval boost keys on them.
const BOARDS = [
  "General",
  "Cambridge (CAIE)",
  "Pearson Edexcel",
  "IB",
  "American (US)",
  "CBSE",
  "ICSE / ISC",
  "French (AEFE)",
  "SABIS",
  "UAE MoE",
  "Saudi Arabia MoE",
  "Qatar MoEHE",
  "Kuwait MoE",
  "Bahrain MoE",
  "Oman MoE",
  "None",
];
const LANGUAGES = ["English", "Arabic", "Hindi", "Urdu"];
const ANALOGIES = ["Daily Life", "Sports", "Cooking", "Bicycles & Trains", "Mobile Phones & Tech"];

type Mode = "login" | "signup" | "forgot" | "reset";

interface LoginProps {
  /** Which panel to open on: the landing page's CTAs deep-link to signup. */
  initialMode?: "login" | "signup";
  /** When set, shows a back control that returns to the landing page. */
  onBack?: () => void;
}

export default function Login({ initialMode = "login", onBack }: LoginProps) {
  const { login, loginWithGoogle, signup, applySession } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const isAuthMode = mode === "login" || mode === "signup";

  // Arriving from the landing page unmounts the element that was focused, so
  // hand focus to the Back control to keep keyboard and screen-reader context.
  useEffect(() => {
    if (onBack) backRef.current?.focus();
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // "Continue with Google": the button hands us a credential we exchange for a
  // session. Only appears when VITE_GOOGLE_CLIENT_ID is configured.
  const google = useGoogleButton(async (credential) => {
    setError(null);
    setBusy(true);
    try {
      // Attribution rides along on both tabs (a brand-new student may tap the
      // Google button from either); the backend only applies it when this
      // sign-in actually creates the account. On the signup tab the FIELD is
      // the single source of truth: a student who emptied a prefilled code
      // chose no attribution, so nothing falls back to localStorage there.
      const ref = normalizeReferralCode(mode === "signup" ? referralCode : getCapturedReferral());
      const { created } = await loginWithGoogle(credential, ref || undefined);
      // Only a signup consumes the captured code. A returning student's
      // sign-in leaves it in place: on a shared phone the next new student
      // may still be the partner's.
      if (ref && created) clearCapturedReferral();
      // On success the AuthProvider sets the account and the app re-renders.
    } catch (err: any) {
      setError(err?.message || "Could not sign in with Google. Please try again.");
    } finally {
      setBusy(false);
    }
  }, mode === "signup" ? "signup_with" : "continue_with");

  // Shared
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Signup profile
  const [name, setName] = useState("");
  const [board, setBoard] = useState("General");
  const [grade, setGrade] = useState("11th Grade");
  const [language, setLanguage] = useState("English");
  const [preferredAnalogy, setPreferredAnalogy] = useState("Daily Life");
  const [examGoals, setExamGoals] = useState("");
  const [confidenceLevel, setConfidenceLevel] = useState(3);

  // Partner referral code: prefilled when the student arrived via ?ref=CODE.
  const [referralCode, setReferralCode] = useState(getCapturedReferral());
  // "(from your link)" is only honest while the field still holds the exact
  // captured code; the moment the student types a different one it disappears.
  const fieldMatchesLink =
    Boolean(getCapturedReferral()) && normalizeReferralCode(referralCode) === getCapturedReferral();
  const [refStatus, setRefStatus] = useState<"idle" | "checking" | "valid" | "invalid" | "unknown">("idle");

  // Inline, debounced "would this code be accepted" check. Advisory only:
  // the server re-validates (and actually claims) at submit, so a network
  // blip here never blocks; it just downgrades to an honest "unknown".
  useEffect(() => {
    const code = normalizeReferralCode(referralCode);
    if (mode !== "signup" || !code) {
      setRefStatus("idle");
      return;
    }
    setRefStatus("checking");
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { valid } = await api.checkReferral(code);
        if (!cancelled) setRefStatus(valid ? "valid" : "invalid");
      } catch {
        if (!cancelled) setRefStatus("unknown");
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [referralCode, mode]);

  // Password-reset flow (forgot → reset)
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        const ref = normalizeReferralCode(referralCode);
        await signup({
          email: email.trim(),
          password,
          name: name.trim(),
          board,
          grade: grade.trim(),
          language,
          preferredAnalogy,
          examGoals: examGoals.trim(),
          confidenceLevel,
          ...(ref ? { referralCode: ref } : {}),
        });
        if (ref) clearCapturedReferral();
      }
      // On success the AuthProvider sets the account and the app re-renders.
    } catch (err: any) {
      // A referral rejection at submit outranks a stale green inline check
      // (the code may have filled up or been paused since the debounce ran).
      if (typeof err?.message === "string" && err.message.includes("referral code")) {
        setRefStatus("invalid");
      }
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Request a reset code. The server is enumeration-safe (identical result
  // whether or not the account exists), so we always advance to the code step.
  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
    } catch {
      /* never reveal existence: advance regardless */
    } finally {
      setBusy(false);
    }
    setNotice(`If an account exists for ${email.trim()}, we've emailed a 6-digit code. Enter it below.`);
    setOtpCode("");
    setNewPassword("");
    setMode("reset");
  };

  // Verify the code + set the new password; on success the server returns a
  // fresh session and we sign the student straight in.
  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token, user } = await api.resetPassword(email.trim(), otpCode.trim(), newPassword);
      applySession(token, user); // app re-renders into the workspace
    } catch (err: any) {
      setError(err?.message || "Could not reset your password. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-xl border border-editorial-line bg-surface px-4 py-3 text-sm text-editorial-charcoal placeholder-editorial-charcoal/35 focus:outline-none focus:ring-1 focus:ring-editorial-sage";
  const label = "text-[10px] uppercase tracking-[0.1em] font-bold text-editorial-sage";

  const heading =
    mode === "forgot" ? "Reset your password" : mode === "reset" ? "Enter your code" : "Faheem";
  const subheading =
    mode === "forgot"
      ? "We'll email you a 6-digit code to reset it."
      : mode === "reset"
      ? "Check your inbox for the code, then set a new password."
      : "Your warm, patient personal AI teacher.";

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-editorial-ivory px-4 py-8 text-editorial-charcoal antialiased">
      {onBack && (
        <button
          ref={backRef}
          onClick={onBack}
          title="Back to the home page"
          className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full border border-editorial-line bg-surface px-3.5 py-2 text-xs text-editorial-charcoal/70 transition-colors hover:bg-editorial-stone focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-editorial-sage md:left-6 md:top-6"
        >
          <ArrowLeft size={13} />
          Back
        </button>
      )}
      <div className="w-full max-w-md">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-editorial-sage">
            <GraduationCap className="text-editorial-ivory" size={22} />
          </div>
          <div>
            <h1 className="kod-display text-3xl tracking-tight">{heading}</h1>
            <p className="mt-1 text-sm text-editorial-charcoal/60">{subheading}</p>
          </div>
        </div>

        <div className="rounded-[28px] border border-editorial-line-light bg-surface p-6 shadow-sm sm:p-8">
          {/* Login / Signup toggle (auth modes only) */}
          {isAuthMode && (
            <div className="mb-6 flex gap-1 rounded-full border border-editorial-line-light bg-editorial-stone/40 p-1">
              {(["login", "signup"] as const).map((m) => (
                <button
                  key={m}
                  aria-pressed={mode === m}
                  title={m === "login" ? "Sign in to your existing account" : "Create a new account"}
                  onClick={() => switchMode(m)}
                  className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold capitalize transition-all ${
                    mode === m ? "bg-surface text-editorial-charcoal shadow-sm" : "text-editorial-charcoal/70 hover:text-editorial-charcoal"
                  }`}
                >
                  {m === "login" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>
          )}

          {google.enabled && isAuthMode && (
            <div className="mb-5">
              <div
                ref={google.ref}
                className={`flex justify-center [color-scheme:light] ${busy ? "pointer-events-none opacity-60" : ""}`}
              />
              <div className="mt-4 flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-editorial-line-light" />
                <span className="text-[11px] uppercase tracking-[0.1em] text-editorial-charcoal/45">or</span>
                <span className="h-px flex-1 bg-editorial-line-light" />
              </div>
            </div>
          )}

          {/* ---- Login / Signup form ---- */}
          {isAuthMode && (
            <form onSubmit={submit} className="flex flex-col gap-3">
              {mode === "signup" && (
                <div className="flex flex-col gap-1.5">
                  <label className={label}>Your name</label>
                  <input className={input} required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className={label}>Email</label>
                <input className={input} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={label}>Password</label>
                <input
                  className={input}
                  type="password"
                  required
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
                />
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => switchMode("forgot")}
                    className="mt-1 self-end text-[11px] font-medium text-editorial-sage underline underline-offset-2 hover:text-editorial-charcoal"
                  >
                    Forgot password?
                  </button>
                )}
              </div>

              {mode === "signup" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className={label}>Board / Exam</label>
                      <select className={input} value={board} onChange={(e) => setBoard(e.target.value)}>
                        {BOARDS.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className={label}>Grade / Level</label>
                      <input className={input} value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="11th Grade" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className={label}>Language</label>
                      <select className={input} value={language} onChange={(e) => setLanguage(e.target.value)}>
                        {LANGUAGES.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className={label}>Analogy style</label>
                      <select className={input} value={preferredAnalogy} onChange={(e) => setPreferredAnalogy(e.target.value)}>
                        {ANALOGIES.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className={label}>Exam goals (optional)</label>
                    <textarea
                      className={`${input} resize-none`}
                      rows={2}
                      value={examGoals}
                      onChange={(e) => setExamGoals(e.target.value)}
                      placeholder="e.g. Ace my exams and build deep conceptual clarity!"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className={label} htmlFor="referral-code">Referral code (optional)</label>
                    <input
                      id="referral-code"
                      className={`${input} uppercase tracking-wide`}
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                      placeholder="e.g. FHM-7WQ2M"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={32}
                      aria-describedby="referral-hint"
                    />
                    <p id="referral-hint" className="text-[11px] leading-relaxed" aria-live="polite">
                      {refStatus === "valid" && (
                        <span className="text-editorial-sage">
                          ✓ This code looks good{fieldMatchesLink ? " (from your link)" : ""}
                        </span>
                      )}
                      {refStatus === "invalid" && (
                        <span className="text-red-700">
                          This code isn't being accepted right now. Check it, or leave the box blank.
                        </span>
                      )}
                      {refStatus === "checking" && <span className="text-editorial-charcoal/45">Checking…</span>}
                      {refStatus === "unknown" && (
                        <span className="text-editorial-charcoal/45">We'll check this code when you create your account.</span>
                      )}
                      {refStatus === "idle" && (
                        <span className="text-editorial-charcoal/45">Got a code from a partner? Enter it here.</span>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className={label}>How confident do you feel right now?</label>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          type="button"
                          key={n}
                          title={`Confidence ${n} of 5`}
                          onClick={() => setConfidenceLevel(n)}
                          className={`flex-1 rounded-full py-2 text-xs font-bold transition-colors ${
                            confidenceLevel >= n ? "bg-editorial-sage text-white" : "bg-editorial-stone text-editorial-charcoal/50"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {error && (
                <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-relaxed text-red-700">{error}</div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-editorial-sage py-3 text-sm font-semibold text-white transition-colors hover:bg-editorial-sage/90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                {mode === "login" ? "Sign in" : "Create my account & start learning"}
              </button>
            </form>
          )}

          {/* ---- Forgot password: ask for the email ---- */}
          {mode === "forgot" && (
            <form onSubmit={submitForgot} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className={label}>Email</label>
                <input className={input} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              {error && <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-relaxed text-red-700">{error}</div>}
              <button
                type="submit"
                disabled={busy}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-editorial-sage py-3 text-sm font-semibold text-white transition-colors hover:bg-editorial-sage/90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                Email me a reset code
              </button>
              <button type="button" onClick={() => switchMode("login")} className="text-center text-[11px] font-medium text-editorial-charcoal/60 underline underline-offset-2 hover:text-editorial-charcoal">
                Back to sign in
              </button>
            </form>
          )}

          {/* ---- Reset: enter code + new password ---- */}
          {mode === "reset" && (
            <form onSubmit={submitReset} className="flex flex-col gap-4">
              {notice && (
                <div className="rounded-xl border border-editorial-line-light bg-editorial-stone/40 p-3 text-xs leading-relaxed text-editorial-charcoal/80">{notice}</div>
              )}
              <div className="flex flex-col gap-2">
                <label className={label}>6-digit code</label>
                <OtpInput value={otpCode} onChange={setOtpCode} disabled={busy} label="Password reset code" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={label}>New password</label>
                <input
                  className={input}
                  type="password"
                  required
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
              </div>
              {error && <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-relaxed text-red-700">{error}</div>}
              <button
                type="submit"
                disabled={busy || otpCode.trim().length !== 6 || newPassword.length < 6}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-editorial-sage py-3 text-sm font-semibold text-white transition-colors hover:bg-editorial-sage/90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                Reset password & sign in
              </button>
              <div className="flex items-center justify-between text-[11px]">
                <button type="button" onClick={() => switchMode("forgot")} className="font-medium text-editorial-sage underline underline-offset-2 hover:text-editorial-charcoal">
                  Resend / change email
                </button>
                <button type="button" onClick={() => switchMode("login")} className="font-medium text-editorial-charcoal/60 underline underline-offset-2 hover:text-editorial-charcoal">
                  Back to sign in
                </button>
              </div>
            </form>
          )}
        </div>

        {isAuthMode && (
          <p className="mt-6 text-center text-[11px] leading-relaxed text-editorial-charcoal/40">
            You can change any of these later in Study Preferences. 🌱
          </p>
        )}
        <p className="mt-2 text-center text-[11px] leading-relaxed text-editorial-charcoal/40">
          Stuck signing in? Write to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-editorial-sage underline underline-offset-2 hover:text-editorial-charcoal">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
