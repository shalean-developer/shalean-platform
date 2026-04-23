"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import BookingContainer from "@/components/layout/BookingContainer";
import { signIn } from "@/lib/auth/authClient";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect")?.trim() || "/dashboard/bookings";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const first = document.querySelector<HTMLInputElement>('input[type="email"]');
    first?.focus();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { user, session, error: err } = await signIn(email, password);
      if (err) {
        setError(err.message);
        return;
      }
      router.replace(redirect.startsWith("/") ? redirect : "/dashboard/bookings");
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

        <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
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
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-primary/30 focus:border-primary focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
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
          >
            {submitting ? "Signing in…" : "Login"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          No account?{" "}
          <Link
            href={`/auth/signup?redirect=${encodeURIComponent(redirect)}`}
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
