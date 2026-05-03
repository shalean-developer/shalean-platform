"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { getResolvedAuthIntent, setAuthIntent } from "@/lib/auth/authRoleIntent";
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
    getResolvedAuthIntent(searchParams.get("intent"));
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
      body: JSON.stringify({ phone: phone.trim(), password }),
    });
    const json = (await res.json()) as {
      error?: string;
      cleanerId?: string;
      session?: {
        access_token: string;
        refresh_token: string;
        expires_in?: number;
        expires_at?: number;
        token_type?: string;
      };
      debug?: { reason?: string; details?: string };
    };
    setBusy(false);
    if (!res.ok || !json.cleanerId) {
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
    const redirectRaw = searchParams.get("redirect")?.trim();
    const fallback = "/cleaner/dashboard";
    const safe = redirectRaw ? sanitizeCleanerPostAuthRedirect(redirectRaw) : fallback;
    const path = safe === "/cleaner" ? fallback : safe;
    /** Full navigation so the next document request includes auth cookies (proxy + RSC see the session). */
    window.location.assign(path);
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="flex flex-1 flex-col justify-center p-4">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
              <Sparkles className="h-7 w-7" aria-hidden />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Cleaner sign in</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Shalean field app — phone and password.</p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label htmlFor="cleaner-phone" className="sr-only">
                  Phone number
                </label>
                <Input
                  id="cleaner-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  placeholder="Phone number"
                  autoComplete="tel"
                  className="h-12 rounded-xl text-base"
                />
              </div>
              <div>
                <label htmlFor="cleaner-password" className="sr-only">
                  Password
                </label>
                <PasswordInput
                  id="cleaner-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Password"
                  autoComplete="current-password"
                  className="h-12 rounded-xl text-base"
                />
              </div>
              <Button type="submit" disabled={busy} size="lg" className="h-12 w-full rounded-xl text-base">
                {busy ? "Signing in…" : "Log in"}
              </Button>
              {error ? <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p> : null}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
