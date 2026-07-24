/**
 * Non-blocking "verify your email" banner. Shown in the signed-in workspace
 * whenever the account's email isn't verified yet. It never blocks studying
 * (the security/recovery goal only needs the inbox proven, not a hard gate):
 * the student can ignore it and keep asking questions.
 *
 * Signup already emailed the first code, so the banner does NOT auto-send — it
 * lets the student enter that code, or Resend (throttled with a live cooldown).
 */
import React, { useEffect, useRef, useState } from "react";
import { MailCheck, X, Loader2 } from "lucide-react";
import { useAuth } from "./AuthContext";
import { api, ApiError } from "./api";
import OtpInput from "./OtpInput";

export default function VerifyBanner() {
  const { account, setAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  // Only render for a signed-in, not-yet-verified account.
  if (!account || account.emailVerified !== false) return null;

  const startCooldown = (sec: number) => {
    setCooldown(sec);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1 && timer.current) clearInterval(timer.current);
        return c > 0 ? c - 1 : 0;
      });
    }, 1000);
  };

  const submit = async (value?: string) => {
    const c = (value ?? code).trim();
    if (c.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.verifyEmailOtp(c);
      setAccount(user); // emailVerified is now true → this banner unmounts
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Could not verify that code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.sendEmailOtp();
      if (r.alreadyVerified) {
        // Verified elsewhere in the meantime — refresh so the banner clears.
        const me = await api.me();
        setAccount(me.user);
        return;
      }
      setNotice(`We emailed a fresh code to ${account.email}.`);
      startCooldown(r.cooldownSec || 60);
    } catch (err: any) {
      const retry = err instanceof ApiError ? (err as any) : null;
      if (retry?.status === 429) startCooldown(60);
      setError(err instanceof ApiError ? err.message : "Could not send a new code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-amber-900 md:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <div className="flex items-center gap-2.5 text-xs sm:text-sm">
          <MailCheck size={16} className="shrink-0" />
          <span className="flex-1">
            Verify your email to secure your account and enable password recovery.
          </span>
          {!open && (
            <button
              onClick={() => setOpen(true)}
              className="shrink-0 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
            >
              Enter code
            </button>
          )}
          {open && (
            <button onClick={() => setOpen(false)} title="Hide" aria-label="Hide" className="shrink-0 rounded-full p-1 hover:bg-amber-100">
              <X size={15} />
            </button>
          )}
        </div>

        {open && (
          <div className="flex flex-col gap-2 pb-1">
            <p className="text-[11px] text-amber-800/90">
              Enter the 6-digit code we emailed to <span className="font-semibold">{account.email}</span>.
            </p>
            <div className="max-w-xs">
              <OtpInput value={code} onChange={setCode} onComplete={(c) => submit(c)} disabled={busy} label="Email verification code" />
            </div>
            {error && <p className="text-[11px] font-medium text-red-700">{error}</p>}
            {notice && !error && <p className="text-[11px] text-amber-800">{notice}</p>}
            <div className="flex items-center gap-3">
              <button
                onClick={() => submit()}
                disabled={busy || code.length !== 6}
                className="flex items-center gap-1.5 rounded-full bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                {busy && <Loader2 size={13} className="animate-spin" />}
                Verify
              </button>
              <button
                onClick={resend}
                disabled={busy || cooldown > 0}
                className="text-xs font-medium text-amber-800 underline underline-offset-2 disabled:no-underline disabled:opacity-60"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
