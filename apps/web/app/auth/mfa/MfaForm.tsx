"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, MailCheck, ShieldCheck } from "lucide-react";

import { AuthCard } from "@/components/auth/AuthShell";
import { requestOfficeEmailCode, verifyOfficeEmailCode } from "@/lib/auth/officeEmailClient";

export function MfaForm({ redirect }: { redirect: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  async function sendCode() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await requestOfficeEmailCode();
      if (!result.ok) {
        if (result.retryAfterSeconds) setResendIn(result.retryAfterSeconds);
        setError(result.error ?? "Could not send the security code.");
        return;
      }
      setSent(true);
      setMaskedEmail(result.email ?? null);
      setResendIn(result.resendAfterSeconds ?? 60);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send the security code.");
    } finally {
      setSubmitting(false);
    }
  }

  async function verify() {
    const trimmed = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit security code from your email.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await verifyOfficeEmailCode(trimmed);
      if (!result.ok) {
        setError(result.error ?? "Verification failed.");
        return;
      }
      router.replace(redirect);
      router.refresh();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Verification failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard>
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Verify your Shalean Office access
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            For management security, we&apos;ll email you a 6-digit code before opening Office.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {!sent ? (
          <>
            <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Click below and Shalean will send the code to the management email on your signed-in account. No authenticator app or second phone is needed.
              </p>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void sendCode()}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {submitting ? "Sending code…" : "Email me a security code"}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              We sent a 6-digit security code{maskedEmail ? <> to <strong>{maskedEmail}</strong></> : " to your management email"}. It expires in 10 minutes.
            </p>
            <label htmlFor="office-email-code" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Security code
            </label>
            <input
              id="office-email-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-center text-lg tracking-[0.35em] text-zinc-900 outline-none ring-primary/30 focus:border-primary focus:ring-2 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
              placeholder="123456"
            />
            <button
              type="button"
              disabled={submitting || code.length !== 6}
              onClick={() => void verify()}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {submitting ? "Verifying…" : "Verify and continue to Office"}
            </button>
            <button
              type="button"
              disabled={submitting || resendIn > 0}
              onClick={() => void sendCode()}
              className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
            >
              {resendIn > 0 ? `Send another code in ${resendIn}s` : "Send another code"}
            </button>
          </>
        )}
      </div>

      {error ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/50 dark:text-red-300" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      ) : null}

      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        This extra verification is required only for privileged Shalean Office access. Customer and cleaner accounts are not affected.
      </p>
    </AuthCard>
  );
}
