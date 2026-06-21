"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Mail } from "lucide-react";
import { AuthBackLink, AuthCard } from "@/components/auth/AuthShell";
import { requestPasswordReset } from "@/lib/auth/authClient";

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect")?.trim() || "/account";

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.querySelector<HTMLInputElement>('input[type="email"]')?.focus();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const { error: err } = await requestPasswordReset(email);
      if (err) {
        setError(err.message);
        return;
      }
      setInfo("If an account exists for that email, we sent a link to reset your password. Check your inbox.");
    } finally {
      setSubmitting(false);
    }
  }

  const loginHref = `/auth/login?redirect=${encodeURIComponent(redirect)}`;

  return (
    <>
      <AuthCard>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Reset your password</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Enter your email and we&apos;ll send you a link to choose a new password.
        </p>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Email address
            </label>
            <div className="relative mt-1.5">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-sm text-zinc-900 outline-none ring-primary/30 placeholder:text-zinc-400 focus:border-primary focus:ring-2 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                placeholder="you@example.com"
              />
            </div>
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
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Remember your password?{" "}
          <Link href={loginHref} className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </AuthCard>

      <AuthBackLink href={loginHref}>← Back to sign in</AuthBackLink>
    </>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthCard>
          <p className="text-center text-sm text-zinc-500">Loading…</p>
        </AuthCard>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}
