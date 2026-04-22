"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type Phase = "loading" | "linked" | "error";

export default function AuthCallbackPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [showPasswordHint, setShowPasswordHint] = useState(true);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    async function run() {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setPhase("error");
        setMessage("Sign-in is not configured on this site.");
        return;
      }

      let session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        for (let i = 0; i < 12; i++) {
          await new Promise((r) => setTimeout(r, 300));
          session = (await supabase.auth.getSession()).data.session;
          if (session) break;
        }
      }

      if (!session) {
        setPhase("error");
        setMessage("No sign-in session found. Open the link from your email again, or request a new link.");
        return;
      }

      const res = await fetch("/api/bookings/link-user", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: session.user.email,
          userId: session.user.id,
        }),
      });
      const json = (await res.json()) as { error?: string };

      if (!res.ok) {
        setPhase("error");
        setMessage(json.error ?? "Could not link your bookings.");
        return;
      }

      setPhase("linked");
    }

    void run();
  }, []);

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      {phase === "loading" ? (
        <div className="text-center">
          <div
            className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-hidden
          />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Signing you in…</p>
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="text-center">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Something went wrong</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
          <Link
            href="/"
            className="mt-8 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Home
          </Link>
        </div>
      ) : null}

      {phase === "linked" ? (
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            ✔
          </div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">You&apos;re signed in</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Your past guest bookings are now on this account.
          </p>

          {showPasswordHint ? (
            <div className="mt-8 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
              <p className="font-medium">Set a password for faster login next time</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Open the booking payment page, choose Login, enter your email, then use Forgot password to set one.
              </p>
              <button
                type="button"
                onClick={() => setShowPasswordHint(false)}
                className="mt-3 text-xs font-semibold text-primary"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          <Link
            href="/"
            className="mt-8 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20"
          >
            Home
          </Link>
        </div>
      ) : null}
    </div>
  );
}
