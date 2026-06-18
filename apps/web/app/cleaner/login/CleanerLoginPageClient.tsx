"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthBackLink, AuthCard } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { getResolvedAuthIntent, setAuthIntent } from "@/lib/auth/authRoleIntent";
import { cacheUserRole } from "@/lib/auth/userRole";
import { sanitizeCleanerPostAuthRedirect } from "@/lib/cleaner/cleanerRedirect";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

function formatLoginFailureMessage(json: {
  error?: string;
  debug?: { reason?: string; details?: string };
}): string {
  const base = json.error ?? "Invalid credentials";
  const reason = json.debug?.reason ? ` (${json.debug.reason})` : "";
  const tail = json.debug?.details ? ` — ${json.debug.details}` : "";
  return `${base}${reason}${tail}`;
}

export function CleanerLoginPageClient() {
  const searchParams = useSearchParams();
  useEffect(() => {
    getResolvedAuthIntent(searchParams.get("intent") ?? "cleaner");
  }, [searchParams]);

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/cleaner/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    });
    const json = (await res.json()) as {
      error?: string;
      debug?: { reason?: string; details?: string };
      session?: { access_token?: string; refresh_token?: string };
    };
    setBusy(false);
    if (!res.ok) {
      setError(formatLoginFailureMessage(json));
      return;
    }
    const sb = getSupabaseBrowser();
    if (!sb) {
      setError(
        "Could not start session: this build is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in the browser. Add them, restart the dev server, and try again.",
      );
      return;
    }
    if (!json.session?.access_token || !json.session?.refresh_token) {
      setError("Login succeeded but the session payload was incomplete. Try again or contact support.");
      return;
    }
    const { error: sessionErr } = await sb.auth.setSession({
      access_token: json.session.access_token,
      refresh_token: json.session.refresh_token,
    });
    if (sessionErr) {
      setError(sessionErr.message || "Could not start session.");
      return;
    }
    setAuthIntent("cleaner");
    cacheUserRole("cleaner");
    const redirectRaw = searchParams.get("redirect")?.trim();
    const fallback = "/jobs";
    const safe = redirectRaw ? sanitizeCleanerPostAuthRedirect(redirectRaw) : fallback;
    window.location.assign(safe);
  }

  const redirect = searchParams.get("redirect")?.trim() || "/jobs";

  return (
    <>
      <AuthCard>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Cleaner sign in</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Use your phone number and password.</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="cleaner-phone" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Phone number
            </label>
            <Input
              id="cleaner-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoComplete="tel"
              placeholder="Phone number"
              className="mt-1.5 h-12 rounded-xl text-base"
            />
          </div>
          <div>
            <label htmlFor="cleaner-password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Password
            </label>
            <PasswordInput
              id="cleaner-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Password"
              className="h-12 rounded-xl text-base"
              wrapperClassName="mt-1.5"
            />
          </div>
          <Button type="submit" disabled={busy} size="lg" className="h-12 w-full rounded-xl text-base">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          {error ? (
            <p className="text-sm text-rose-700 dark:text-rose-400" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </AuthCard>

      <AuthBackLink href={`/auth?redirect=${encodeURIComponent(redirect)}`}>← Back to account selection</AuthBackLink>
    </>
  );
}
