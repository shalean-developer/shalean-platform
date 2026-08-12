"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ShieldCheck } from "lucide-react";

import { AuthCard } from "@/components/auth/AuthShell";
import {
  enrollMfaTotp,
  getMfaStatus,
  unenrollMfaFactor,
  verifyMfaTotp,
} from "@/lib/auth/authClient";

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export function MfaForm({ redirect }: { redirect: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"enroll" | "challenge">("enroll");
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null);
  const [staleFactorId, setStaleFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { status, error: statusError } = await getMfaStatus();
      if (!active) return;
      if (statusError || !status) {
        setError(statusError?.message ?? "Could not load multi-factor authentication status.");
        setLoading(false);
        return;
      }
      if (status.currentLevel === "aal2") {
        router.replace(redirect);
        router.refresh();
        return;
      }
      if (status.verifiedTotpFactorId) {
        setVerifiedFactorId(status.verifiedTotpFactorId);
        setMode("challenge");
      } else {
        setStaleFactorId(status.unverifiedTotpFactorId);
        setMode("enroll");
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [redirect, router]);

  async function startEnrollment() {
    setError(null);
    setSubmitting(true);
    try {
      // Supabase keeps abandoned TOTP enrollments as unverified factors. Remove
      // that stale factor before creating a replacement so a repeated setup
      // attempt cannot fail with the duplicate friendly-name error.
      if (staleFactorId) {
        const { error: unenrollError } = await unenrollMfaFactor(staleFactorId);
        if (unenrollError) {
          setError(`Could not restart authenticator setup: ${unenrollError.message}`);
          return;
        }
        setStaleFactorId(null);
      }

      const { data, error: enrollError } = await enrollMfaTotp();
      if (enrollError || !data?.id || !data.totp?.qr_code || !data.totp.secret) {
        setError(enrollError?.message ?? "Could not start authenticator setup.");
        return;
      }
      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function verify(factorId: string) {
    const trimmed = code.replace(/\s+/g, "");
    if (trimmed.length < 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { error: verifyError } = await verifyMfaTotp(factorId, trimmed);
      if (verifyError) {
        setError(verifyError.message);
        return;
      }
      router.replace(redirect);
      router.refresh();
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
            Multi-factor authentication required
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Privileged Shalean Office access requires a verified authenticator session.
          </p>
        </div>
      </div>

      {loading ? <p className="mt-6 text-sm text-zinc-500">Checking your security settings…</p> : null}

      {!loading && mode === "challenge" && verifiedFactorId ? (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Enter the code from your authenticator app to continue to Office.
          </p>
          <label htmlFor="mfa-code" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Authenticator code
          </label>
          <input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm tracking-[0.25em] text-zinc-900 outline-none ring-primary/30 focus:border-primary focus:ring-2 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
            placeholder="123456"
          />
          <button
            type="button"
            disabled={submitting}
            onClick={() => void verify(verifiedFactorId)}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {submitting ? "Verifying…" : "Verify and continue"}
          </button>
        </div>
      ) : null}

      {!loading && mode === "enroll" ? (
        <div className="mt-6 space-y-4">
          {!enrollment ? (
            <>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Use an authenticator app such as Microsoft Authenticator, Google Authenticator, 1Password, or Authy.
              </p>
              {staleFactorId ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  An unfinished authenticator setup was found. Shalean will safely restart it and generate a fresh QR code.
                </p>
              ) : null}
              <button
                type="button"
                disabled={submitting}
                onClick={() => void startEnrollment()}
                className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {submitting ? "Starting setup…" : staleFactorId ? "Restart authenticator setup" : "Set up authenticator"}
              </button>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                {/* Supabase returns a data URI for the TOTP QR code. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={enrollment.qrCode} alt="Authenticator setup QR code" className="mx-auto h-48 w-48" />
                <p className="mt-3 break-all text-center text-xs text-zinc-500">Manual key: {enrollment.secret}</p>
              </div>
              <label htmlFor="mfa-enroll-code" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Enter the 6-digit code
              </label>
              <input
                id="mfa-enroll-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm tracking-[0.25em] text-zinc-900 outline-none ring-primary/30 focus:border-primary focus:ring-2 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                placeholder="123456"
              />
              <button
                type="button"
                disabled={submitting}
                onClick={() => void verify(enrollment.factorId)}
                className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {submitting ? "Verifying…" : "Verify and finish setup"}
              </button>
            </>
          )}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/50 dark:text-red-300" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      ) : null}

      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        You must complete MFA before privileged Office APIs will accept this session.
      </p>
    </AuthCard>
  );
}
