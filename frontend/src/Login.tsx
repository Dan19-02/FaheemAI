/**
 * Login / Sign-up screen (email + password, JWT auth).
 * Sign-up collects the full student profile in one go; everything is editable
 * later in Study Preferences. Mobile-first, Arabic-first "Pearl & Ink" identity.
 */
import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "./AuthContext";
import { useGoogleButton } from "./googleSignIn";
import { SUPPORT_EMAIL } from "./defaults";

// Stored values stay English (the backend + profile use them); labels render
// in Arabic so the whole screen loads Arabic by default.
const BOARDS = ["Bahrain MoE", "CBSE", "Cambridge"];
const GRADES = ["Grade 9", "Grade 10", "Grade 11", "Grade 12"];
const LANGUAGES = ["Arabic", "English"];
const ANALOGIES = ["Daily Life", "Sports", "Cooking", "Bicycles & Trains", "Mobile Phones & Tech"];

const AR: Record<string, string> = {
  "Bahrain MoE": "وزارة التربية (البحرين)",
  CBSE: "CBSE",
  Cambridge: "كامبريدج",
  "Grade 9": "الصف التاسع",
  "Grade 10": "الصف العاشر",
  "Grade 11": "الصف الحادي عشر",
  "Grade 12": "الصف الثاني عشر",
  Arabic: "العربية",
  English: "English",
  "Daily Life": "الحياة اليومية",
  Sports: "الرياضة",
  Cooking: "الطبخ",
  "Bicycles & Trains": "الدراجات والقطارات",
  "Mobile Phones & Tech": "الهواتف والتقنية",
};
const arLabel = (v: string) => AR[v] || v;

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
    } catch (err: any) {
      setError(err?.message || "تعذّر تسجيل الدخول عبر Google.");
    } finally {
      setBusy(false);
    }
  }, mode === "signup" ? "signup_with" : "continue_with");

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
    } catch (err: any) {
      setError(err?.message || "حدث خطأ. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-xl border border-[var(--color-line)] bg-white px-4 py-3 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-soft)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-sea)]/40";
  const label = "text-[11px] font-bold text-[var(--color-ink-soft)]";

  return (
    <div dir="rtl" className="fahim-app faheem-pattern relative flex min-h-[100dvh] flex-col items-center justify-center bg-[var(--color-pearl)] px-4 py-8 text-[var(--color-ink)] antialiased">
      {onBack && (
        <button
          ref={backRef}
          onClick={onBack}
          className="absolute end-4 top-4 flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-white px-3.5 py-2 text-xs text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-sand)] md:end-6 md:top-6"
        >
          <ArrowLeft size={13} className="rtl:rotate-180" />
          رجوع
        </button>
      )}
      <div className="w-full max-w-md">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="faheem-mark h-14 w-14 text-2xl">ف</div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[var(--color-ink)]">فهيم</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">معلّمك الشخصي الصبور، بلغتك، على منهجك.</p>
          </div>
        </div>

        <div className="faheem-card p-6 sm:p-8">
          {/* Login / Signup toggle */}
          <div className="mb-6 flex gap-1 rounded-full border border-[var(--color-line-soft)] bg-[var(--color-sand)]/50 p-1">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`flex-1 rounded-full px-3 py-2 text-xs font-bold transition-all ${
                  mode === m ? "bg-white text-[var(--color-ink)] shadow-sm" : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                }`}
              >
                {m === "login" ? "تسجيل الدخول" : "إنشاء حساب"}
              </button>
            ))}
          </div>

          {google.enabled && (
            <div className="mb-5">
              <div ref={google.ref} className={`flex justify-center [color-scheme:light] ${busy ? "pointer-events-none opacity-60" : ""}`} />
              <div className="mt-4 flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-[var(--color-line-soft)]" />
                <span className="text-[11px] tracking-wide text-[var(--color-ink-soft)]">أو</span>
                <span className="h-px flex-1 bg-[var(--color-line-soft)]" />
              </div>
            </div>
          )}

          <form onSubmit={submit} className="flex flex-col gap-3">
            {mode === "signup" && (
              <div className="flex flex-col gap-1.5">
                <label className={label}>اسمك</label>
                <input className={input} required value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: أحمد" />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className={label}>البريد الإلكتروني</label>
              <input className={`${input} font-latin`} dir="ltr" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={label}>كلمة المرور</label>
              <input
                className={input}
                type="password"
                required
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "٦ أحرف على الأقل" : "كلمة المرور"}
              />
            </div>

            {mode === "signup" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className={label}>المنهج</label>
                    <select className={input} value={board} onChange={(e) => setBoard(e.target.value)}>
                      {BOARDS.map((b) => (
                        <option key={b} value={b}>{arLabel(b)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={label}>الصف</label>
                    <select className={input} value={grade} onChange={(e) => setGrade(e.target.value)}>
                      {GRADES.map((g) => (
                        <option key={g} value={g}>{arLabel(g)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className={label}>اللغة</label>
                    <select className={input} value={language} onChange={(e) => setLanguage(e.target.value)}>
                      {LANGUAGES.map((l) => (
                        <option key={l} value={l}>{arLabel(l)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={label}>أسلوب التشبيه</label>
                    <select className={input} value={preferredAnalogy} onChange={(e) => setPreferredAnalogy(e.target.value)}>
                      {ANALOGIES.map((a) => (
                        <option key={a} value={a}>{arLabel(a)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={label}>أهدافك الدراسية (اختياري)</label>
                  <textarea
                    className={`${input} resize-none`}
                    rows={2}
                    value={examGoals}
                    onChange={(e) => setExamGoals(e.target.value)}
                    placeholder="مثال: أن أفهم موادي بعمق وأتفوّق في الامتحانات!"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={label}>ما مدى ثقتك بنفسك الآن؟</label>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        type="button"
                        key={n}
                        onClick={() => setConfidenceLevel(n)}
                        className={`font-latin flex-1 rounded-full py-2 text-xs font-bold transition-colors ${
                          confidenceLevel >= n ? "bg-[var(--color-sea)] text-white" : "bg-[var(--color-sand)] text-[var(--color-ink-soft)]"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {error && <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-relaxed text-red-700">{error}</div>}

            <button type="submit" disabled={busy} className="faheem-btn mt-1 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm disabled:opacity-50">
              {busy && <Loader2 className="animate-spin" size={16} />}
              {mode === "login" ? "تسجيل الدخول" : "أنشئ حسابي وابدأ التعلّم"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-[var(--color-ink-soft)]">يمكنك تغيير أيٍّ من هذا لاحقًا في تفضيلات الدراسة. 🌱</p>
        <p className="mt-2 text-center text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
          تواجه مشكلة في الدخول؟ راسلنا على{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className="font-latin text-[var(--color-sea)] underline underline-offset-2">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
