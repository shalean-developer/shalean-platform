"use client";

import { useState } from "react";
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
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Bookings require an account. Sign in or create one to review and confirm.
        </p>
      </div>

      <div className="flex rounded-xl border border-zinc-200 p-1 dark:border-zinc-700">
        <button
          type="button"
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition",
            mode === "login"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
              : "text-zinc-600 dark:text-zinc-400",
          )}
          onClick={() => {
            setMode("login");
            setError(null);
            setInfo(null);
          }}
        >
          Log in
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition",
            mode === "signup"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
              : "text-zinc-600 dark:text-zinc-400",
          )}
          onClick={() => {
            setMode("signup");
            setError(null);
            setInfo(null);
          }}
        >
          Sign up
        </button>
      </div>

      {mode === "login" ? (
        <form onSubmit={(e) => void handleLogin(e)} className="space-y-4">
          <div>
            <label htmlFor="book-login-email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Email
            </label>
            <input
              id="book-login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-zinc-600 dark:bg-zinc-950"
            />
          </div>
          <div>
            <label htmlFor="book-login-password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Password
            </label>
            <PasswordInput
              id="book-login-password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              wrapperClassName="mt-1"
            />
          </div>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200" role="alert">
              {error}
            </p>
          ) : null}
          {info ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              {info}
            </p>
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
            <input
              id="book-signup-name"
              type="text"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-zinc-600 dark:bg-zinc-950"
            />
          </div>
          <div>
            <label htmlFor="book-signup-phone" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Cell number
            </label>
            <input
              id="book-signup-phone"
              type="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-zinc-600 dark:bg-zinc-950"
            />
          </div>
          <div>
            <label htmlFor="book-signup-email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Email
            </label>
            <input
              id="book-signup-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-zinc-600 dark:bg-zinc-950"
            />
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              wrapperClassName="mt-1"
            />
          </div>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200" role="alert">
              {error}
            </p>
          ) : null}
          {info ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              {info}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={busy} className="h-12 w-full rounded-2xl">
            {busy ? "Creating account…" : "Create account and continue"}
          </Button>
        </form>
      )}
    </section>
  );
}
