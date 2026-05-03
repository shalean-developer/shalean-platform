"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import BookingContainer from "@/components/layout/BookingContainer";
import { PasswordInput } from "@/components/ui/password-input";
import { getResolvedAuthIntent, parseIntentQuery } from "@/lib/auth/authRoleIntent";
import { resolveCustomerPostAuthDestination } from "@/lib/auth/resolveCustomerPostAuthDestination";
import { signIn } from "@/lib/auth/authClient";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect")?.trim() || "/dashboard/bookings";
  const intentParam = searchParams.get("intent");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getResolvedAuthIntent(intentParam);
  }, [intentParam]);

  useEffect(() => {
    const first = document.querySelector<HTMLInputElement>('input[type="email"]');
    first?.focus();
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
      const next = await resolveCustomerPostAuthDestination(session.access_token, redirect, intentParam);
      router.replace(next);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BookingContainer className="py-12 sm:py-16">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Log in</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Welcome back to Shalean Cleaning.</p>

        {/* suppressHydrationWarning: extensions (e.g. password managers) inject attrs like fdprocessedid before hydrate */}
        <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4" suppressHydrationWarning>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-primary/30 placeholder:text-zinc-400 focus:border-primary focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
              placeholder="you@example.com"
              suppressHydrationWarning
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Password
            </label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              wrapperClassName="mt-1"
              suppressHydrationWarning
            />
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 disabled:opacity-60"
            suppressHydrationWarning
          >
            {submitting ? "Signing in…" : "Login"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          No account?{" "}
          <Link
            href={`/auth/signup?redirect=${encodeURIComponent(redirect)}&intent=${encodeURIComponent(intentForSignup)}`}
            className="font-semibold text-primary hover:underline"
          >
            Create account
          </Link>
        </p>

        <p className="mt-4 text-center">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
            ← Home
          </Link>
        </p>
      </div>
    </BookingContainer>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <Suspense
        fallback={
          <BookingContainer className="py-16">
            <p className="text-center text-sm text-zinc-500">Loading…</p>
          </BookingContainer>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
