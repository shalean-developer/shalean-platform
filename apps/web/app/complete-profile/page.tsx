"use client";

import { useEffect, useState } from "react";
import { AuthCard } from "@/components/auth/AuthShell";
import { reportSignOutFailure, signOut } from "@/lib/auth/authClient";
import { getSupabaseBrowser, getSupabaseSession } from "@/lib/supabase/browser";

type RepairResponse = {
  ok?: boolean;
  dashboardRoute?: string;
  error?: string;
};

const PROFILE_REPAIR_TIMEOUT_MS = 8_000;
const PROFILE_SESSION_TIMEOUT_MS = 8_000;

async function getBoundedProfileSession() {
  let timer: number | null = null;
  try {
    return await Promise.race([
      getSupabaseSession(),
      new Promise<null>((resolve) => {
        timer = window.setTimeout(() => resolve(null), PROFILE_SESSION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== null) window.clearTimeout(timer);
  }
}

export default function CompleteProfilePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(true);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setError("Sign-in is not configured on this site.");
      setRepairing(false);
      return;
    }

    let active = true;

    void (async () => {
      const session = await getBoundedProfileSession();
      if (!active) return;

      if (!session?.access_token) {
        window.location.replace("/auth/login");
        return;
      }

      setEmail(session.user.email ?? null);
      const redirect = new URL(window.location.href).searchParams.get("redirect");

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), PROFILE_REPAIR_TIMEOUT_MS);

      try {
        const res = await fetch("/api/auth/complete-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: session.access_token,
            redirect,
          }),
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => ({}))) as RepairResponse;
        if (!active) return;

        if (!res.ok || !json.ok || !json.dashboardRoute) {
          setError(json.error ?? "Could not repair your account profile. Contact support.");
          setRepairing(false);
          return;
        }

        window.location.replace(json.dashboardRoute);
      } catch (e) {
        if (!active) return;
        setError(
          e instanceof DOMException && e.name === "AbortError"
            ? "Profile repair timed out. Check your connection and try again."
            : e instanceof Error
              ? e.message
              : "Could not restore your sign-in session. Sign out and try again.",
        );
        setRepairing(false);
      } finally {
        window.clearTimeout(timer);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  async function handleSignOut() {
    try {
      await signOut();
      window.location.replace("/auth/login");
    } catch (e) {
      reportSignOutFailure(e);
    }
  }

  return (
    <AuthCard>
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Complete your profile</h1>
      {repairing ? (
        <>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            We are restoring your account profile{email ? ` for ${email}` : ""} and checking the correct workspace.
          </p>
          <div className="mt-6 flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400" role="status">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
            Repairing profile…
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {error ?? "We could not restore this account profile automatically."}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <a
              href="mailto:support@shalean.co.za"
              className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
            >
              Contact support
            </a>
            <button
              type="button"
              className="rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
              onClick={() => void handleSignOut()}
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </AuthCard>
  );
}
