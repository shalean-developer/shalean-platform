"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/ui/password-input";
import { updatePassword } from "@/lib/auth/authClient";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setSessionError("Sign-in is not configured on this site.");
      return;
    }

    let active = true;

    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setSessionReady(true);
        setSessionError(null);
      }
    });

    void (async () => {
      for (let i = 0; i < 15; i++) {
        const { data } = await sb.auth.getSession();
        if (!active) return;
        if (data.session) {
          setSessionReady(true);
          setSessionError(null);
          return;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      if (active) {
        setSessionError("This reset link is invalid or has expired. Request a new one from the sign-in page.");
      }
    })();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const { error: err } = await updatePassword(password);
      if (err) {
        setError(err.message);
        return;
      }
      setInfo("Your password has been updated. Redirecting to sign in…");
      window.setTimeout(() => {
        router.replace("/auth/login");
        router.refresh();
      }, 1500);
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionError) {
    return (
      <AuthCard>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Link expired</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{sessionError}</p>
        <Link
          href="/auth/forgot-password"
          className="mt-6 inline-flex w-full justify-center rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
        >
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  if (!sessionReady) {
    return (
      <AuthCard>
        <div className="text-center">
          <div
            className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-hidden
          />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Verifying reset link…</p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Choose a new password</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Enter and confirm your new password below.</p>

      <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            New password
          </label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            wrapperClassName="mt-1.5"
            placeholder="Min. 6 characters"
          />
        </div>

        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Confirm password
          </label>
          <PasswordInput
            id="confirm"
            name="confirm"
            autoComplete="new-password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            wrapperClassName="mt-1.5"
            placeholder="Repeat password"
          />
        </div>

        {error ? (
          <div
            className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/50 dark:text-red-300"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {error}
          </div>
        ) : null}
        {info ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            {info}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting || Boolean(info)}
          className="mt-2 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthCard>
          <p className="text-center text-sm text-zinc-500">Loading…</p>
        </AuthCard>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
