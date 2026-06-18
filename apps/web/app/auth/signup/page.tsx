"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AlertCircle, Mail, User } from "lucide-react";
import { AuthBackLink, AuthCard, AuthLegalFooter } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/ui/password-input";
import { getResolvedAuthIntent, parseIntentQuery } from "@/lib/auth/authRoleIntent";
import { resolvePostAuthDestination } from "@/lib/auth/resolvePostAuthDestination";
import { signUp } from "@/lib/auth/authClient";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect")?.trim() || "/account";
  const intentParam = searchParams.get("intent");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getResolvedAuthIntent(intentParam);
  }, [intentParam]);

  useEffect(() => {
    document.querySelector<HTMLInputElement>("#fullName")?.focus();
  }, []);

  const intentForLogin = parseIntentQuery(intentParam) ?? "customer";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const { user, session, error: err } = await signUp(email, password, fullName);
      if (err) {
        setError(err.message);
        return;
      }
      if (session?.access_token && user) {
        const result = await resolvePostAuthDestination(session.access_token, redirect);
        if (result.kind === "timeout") {
          setError("Could not verify your account role in time. Check your connection and try again.");
          return;
        }
        if (result.kind === "error") {
          setError(result.message);
          return;
        }
        router.replace(result.path);
        router.refresh();
        return;
      }
      setInfo("Check your email to confirm your account, then you can log in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <AuthCard>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Create your account</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Book faster next time with Shalean.</p>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Full name
            </label>
            <div className="relative mt-1.5">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
              <input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-sm text-zinc-900 outline-none ring-primary/30 placeholder:text-zinc-400 focus:border-primary focus:ring-2 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                placeholder="Jane Doe"
              />
            </div>
          </div>

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

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Password
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
              {info}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Already have an account?{" "}
          <Link
            href={`/auth/login?redirect=${encodeURIComponent(redirect)}&intent=${encodeURIComponent(intentForLogin)}`}
            className="font-semibold text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      </AuthCard>

      <AuthBackLink href={`/auth?redirect=${encodeURIComponent(redirect)}`}>← Back to account selection</AuthBackLink>
      <AuthLegalFooter />
    </>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <AuthCard>
          <p className="text-center text-sm text-zinc-500">Loading…</p>
        </AuthCard>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
