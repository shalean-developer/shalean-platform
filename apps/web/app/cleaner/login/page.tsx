"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export default function CleanerLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
      const reason = json.debug?.reason ? ` (${json.debug.reason})` : "";
      setError((json.error ?? "Invalid credentials") + reason);
      return;
    }
    const sb = getSupabaseBrowser();
    if (json.session && sb) {
      const { error: sessionErr } = await sb.auth.setSession({
        access_token: json.session.access_token,
        refresh_token: json.session.refresh_token,
      });
      if (sessionErr) {
        setError(sessionErr.message || "Could not start session.");
        return;
      }
    }
    localStorage.setItem("cleaner_id", json.cleanerId);
    const redirect = searchParams.get("redirect")?.trim();
    router.replace(redirect && redirect.startsWith("/") ? redirect : "/cleaner");
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Cleaner Login</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Sign in with phone number and password.</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            placeholder="Phone number"
            className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Password"
            className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 w-full rounded-lg bg-emerald-600 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Signing in..." : "Login"}
          </button>
          {error ? <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
