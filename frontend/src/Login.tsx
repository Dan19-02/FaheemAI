/**
 * Login / Sign-up screen (email + password, JWT auth).
 * Sign-up collects the full student profile in one go; everything is editable
 * later in Study Preferences. Mobile-first, editorial theme.
 */
import React, { useEffect, useRef, useState } from "react";
import { GraduationCap, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "./AuthContext";
import { useGoogleButton } from "./googleSignIn";
import { SUPPORT_EMAIL } from "./defaults";

const BOARDS = ["Bahrain MoE", "CBSE", "Cambridge"];
const GRADES = ["Grade 9", "Grade 10", "Grade 11", "Grade 12"];
const LANGUAGES = ["Arabic", "English"];
const ANALOGIES = ["Daily Life", "Sports", "Cooking", "Bicycles & Trains", "Mobile Phones & Tech"];

interface LoginProps {
  /** Which panel to open on: the landing page's CTAs deep-link to signup. */
  initialMode?: "login" | "signup";
  /** When set, shows a back control that returns to the landing page. */
  onBack?: () => void;
}

export default function Login({ initialMode = "login", onBack }: LoginProps) {
  const { login, loginWithGoogle, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const backRef = useRef<HTMLButtonElement | null>(null);

  // Arriving from the landing page unmounts the element that was focused, so
  // hand focus to the Back control to keep keyboard and screen-reader context.
  useEffect(() => {
    if (onBack) backRef.current?.focus();
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Continue with Google": the button hands us a credential we exchange for a
  // session. Only appears when VITE_GOOGLE_CLIENT_ID is configured.
  const google = useGoogleButton(async (credential) => {
    setError(null);
    setBusy(true);
    try {
      await loginWithGoogle(credential);
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
  const [board, setBoard] = useState("Bahrain MoE");
  const [grade, setGrade] = useState("Grade 10");
  const [language, setLanguage] = useState("Arabic");
  const [preferredAnalogy, setPreferredAnalogy] = useState("Daily Life");
  const [examGoals, setExamGoals] = useState("");
  const [confidenceLevel, setConfidenceLevel] = useState(3);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
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
        });
      }
      // On success the AuthProvider sets the account and the app re-renders.
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-xl border border-editorial-line bg-white px-4 py-3 text-sm text-editorial-charcoal placeholder-editorial-charcoal/35 focus:outline-none focus:ring-1 focus:ring-editorial-sage";
  const label = "text-[10px] uppercase tracking-[0.1em] font-bold text-editorial-sage";

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-editorial-ivory px-4 py-8 text-editorial-charcoal antialiased">
      {onBack && (
        <button
          ref={backRef}
          onClick={onBack}
          className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full border border-editorial-line bg-white px-3.5 py-2 text-xs text-editorial-charcoal/70 transition-colors hover:bg-editorial-stone focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-editorial-sage md:left-6 md:top-6"
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
            <h1 className="font-serif text-3xl italic tracking-tight">Clarify.AI</h1>
            <p className="mt-1 text-sm text-editorial-charcoal/60">Your warm, patient personal AI teacher.</p>
          </div>
        </div>

        <div className="rounded-[28px] border border-editorial-line-light bg-white p-6 shadow-sm sm:p-8">
          {/* Login / Signup toggle */}
          <div className="mb-6 flex gap-1 rounded-full border border-editorial-line-light bg-editorial-stone/40 p-1">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold capitalize transition-all ${
                  mode === m ? "bg-white text-editorial-charcoal shadow-sm" : "text-editorial-charcoal/70 hover:text-editorial-charcoal"
                }`}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {google.enabled && (
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

          <form onSubmit={submit} className="flex flex-col gap-3">
            {mode === "signup" && (
              <div className="flex flex-col gap-1.5">
                <label className={label}>Your name</label>
                <input className={input} required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ahmed" />
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
                    <select className={input} value={grade} onChange={(e) => setGrade(e.target.value)}>
                      {GRADES.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
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
                    placeholder="e.g. Understand my subjects deeply and do well in exams!"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={label}>How confident do you feel right now?</label>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        type="button"
                        key={n}
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
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-editorial-charcoal/40">
          You can change any of these later in Study Preferences. 🌱
        </p>
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
