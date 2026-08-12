"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { AlertCircle, Mail } from "lucide-react";
import { AuthBackLink, AuthCard } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/ui/password-input";
import { getMfaStatus, signIn } from "@/lib/auth/authClient";
import { getResolvedAuthIntent, parseIntentQuery } from "@/lib/auth/authRoleIntent";
import { resolvePostAuthDestination } from "@/lib/auth/resolvePostAuthDestination";
import { stripCredentialParamsFromBrowserUrl } from "@/lib/auth/sanitizeLoginSearchParams";
import { readCachedUserRole } from "@/lib/auth/userRole";

export function LoginForm({
  initialEmail = "",
  stripCredentialsFromUrl = false,
  redirect = "/account",
  intent = null,
}: {
  initialEmail?: string;
  stripCredentialsFromUrl?: boolean;
  /** Safe in-app post-login path from server `searchParams`. */
  redirect?: string;
  intent?: string | null;
}) {
  const router = useRouter();
  const intentParam = intent;

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useLayoutEffect(() => {
    stripCredentialParamsFromBrowserUrl();
  }, []);

  useEffect(() => {
    if (stripCredentialsFromUrl) {
      stripCredentialParamsFromBrowserUrl();
    }
  }, [stripCredentialsFromUrl]);

  useEffect(() => {
    getResolvedAuthIntent(intentParam);
  }, [intentParam]);

  useEffect(() => {
    document.querySelector<HTMLInputElement>('input[type="email"]')?.focus();
  }, []);

  const intentForSignup = parseIntentQuery(intentParam) ?? "customer";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { session, error: err } = await signIn(email, password);
      if (err) {
        setError(err.message);
        return;
      }
      if (!session?.access_token) {
        setError("No session returned. Try again.");
        return;
      }
      const result = await resolvePostAuthDestination(session.access_token, redirect);
      if (result.kind === "timeout") {
        setError("Could not verify your account role in time. Check your connection and try again.");
        return;
      }
      if (result.kind === "error") {
        setError(result.message);
        return;
      }

      if (readCachedUserRole() === "admin" && result.path.startsWith("/office")) {
        const { status } = await getMfaStatus();
        if (status?.currentLevel !== "aal2") {
          router.replace(`/auth/mfa?redirect=${encodeURIComponent(result.path)}`);
          router.refresh();
          return;
        }
      }

      router.replace(result.path);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <AuthCard>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Welcome back</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Sign in to your Shalean account.</p>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4" suppressHydrationWarning>
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
                suppressHydrationWarning
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Password
              </label>
              <Link href="/auth/forgot-password" className="text-xs font-medium text-primary hover:underline" tabIndex={-1}>
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              wrapperClassName="mt-1.5"
              suppressHydrationWarning
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

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
            suppressHydrationWarning
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No account?{" "}
          <Link
            href={`/auth/signup?redirect=${encodeURIComponent(redirect)}&intent=${encodeURIComponent(intentForSignup)}`}
            className="font-semibold text-primary hover:underline"
          >
            Create one
          </Link>
        </p>
      </AuthCard>

      <AuthBackLink href={`/auth?redirect=${encodeURIComponent(redirect)}`}>← Back to account selection</AuthBackLink>
    </>
  );
}
