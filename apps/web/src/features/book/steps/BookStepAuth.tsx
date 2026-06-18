"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Mail, Phone, User } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { signIn, signUp } from "@/lib/auth/authClient";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

type BookStepAuthProps = {
  onAuthenticated: () => void;
};

type AuthMode = "login" | "signup";

export function BookStepAuth({ onAuthenticated }: BookStepAuthProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function persistProfile(userId: string, name: string, cell: string) {
    const sb = getSupabaseClient();
    if (!sb) return;
    await sb.auth.updateUser({
      data: {
        full_name: name.trim(),
        phone: cell.trim(),
        book_auth_type: "register",
      },
    });
    const { error } = await sb
      .from("user_profiles")
      .update({ full_name: name.trim(), updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) {
      /* full_name column may be absent on older DBs — metadata is source of truth */
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
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
      onAuthenticated();
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (fullName.trim().length < 2) {
      setError("Enter your full name.");
      return;
    }
    if (phone.trim().length < 7) {
      setError("Enter a valid cell number.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      const { user, session, error: err } = await signUp(email, password, fullName, phone);
      if (err) {
        setError(err.message);
        return;
      }
      if (user?.id) {
        await persistProfile(user.id, fullName, phone);
      }
      if (session?.access_token) {
        onAuthenticated();
        return;
      }
      setInfo("Check your email to confirm your account, then log in to continue.");
      setMode("login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6" aria-labelledby="book-step-auth-heading">
      <div>
        <h1
          id="book-step-auth-heading"
          className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          Sign in to continue
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Bookings require an account. Sign in or create one to review and confirm.
        </p>
      </div>

      {/* Tab toggle — blue active style consistent with booking-v2 */}
      <div className="flex rounded-xl border border-zinc-200 p-1 dark:border-zinc-700">
        {(["login", "signup"] as AuthMode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-semibold transition",
              mode === m
                ? "bg-blue-600 text-white shadow-sm"
                : "text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
            )}
            onClick={() => {
              setMode(m);
              setError(null);
              setInfo(null);
            }}
          >
            {m === "login" ? "Log in" : "Sign up"}
          </button>
        ))}
      </div>

      {mode === "login" ? (
        <form onSubmit={(e) => void handleLogin(e)} className="space-y-4">
          <div>
            <label htmlFor="book-login-email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Email address
            </label>
            <div className="relative mt-1.5">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
              <input
                id="book-login-email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none placeholder:text-zinc-400 focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="book-login-password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Password
              </label>
              <a
                href="/auth/forgot-password"
                className="text-xs font-medium text-primary hover:underline"
                tabIndex={-1}
              >
                Forgot password?
              </a>
            </div>
            <PasswordInput
              id="book-login-password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              wrapperClassName="mt-1.5"
            />
          </div>
          {error ? (
            <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/50 dark:text-red-300" role="alert">
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
          <Button type="submit" size="lg" disabled={busy} className="h-12 w-full rounded-2xl">
            {busy ? "Signing in…" : "Log in and continue"}
          </Button>
        </form>
      ) : (
        <form onSubmit={(e) => void handleSignup(e)} className="space-y-4">
          <div>
            <label htmlFor="book-signup-name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Full name
            </label>
            <div className="relative mt-1.5">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
              <input
                id="book-signup-name"
                type="text"
                autoComplete="name"
                required
                placeholder="Jane Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none placeholder:text-zinc-400 focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
          </div>
          <div>
            <label htmlFor="book-signup-phone" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Cell number
            </label>
            <div className="relative mt-1.5">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
              <input
                id="book-signup-phone"
                type="tel"
                autoComplete="tel"
                required
                placeholder="0821234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none placeholder:text-zinc-400 focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
          </div>
          <div>
            <label htmlFor="book-signup-email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Email address
            </label>
            <div className="relative mt-1.5">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
              <input
                id="book-signup-email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none placeholder:text-zinc-400 focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
          </div>
          <div>
            <label htmlFor="book-signup-password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Password
            </label>
            <PasswordInput
              id="book-signup-password"
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="Min. 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              wrapperClassName="mt-1.5"
            />
          </div>
          {error ? (
            <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/50 dark:text-red-300" role="alert">
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
          <Button type="submit" size="lg" disabled={busy} className="h-12 w-full rounded-2xl">
            {busy ? "Creating account…" : "Create account and continue"}
          </Button>
        </form>
      )}
    </section>
  );
}
