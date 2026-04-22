"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export default function CleanerDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getSupabaseBrowser();
      if (!sb) {
        setBlocked("Sign-in is not available.");
        setLoading(false);
        return;
      }
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        router.replace("/auth/login?next=/cleaner/dashboard");
        return;
      }
      const res = await fetch("/api/cleaner/me", { headers: { Authorization: `Bearer ${token}` } });
      const j = (await res.json()) as { isCleaner?: boolean; cleaner?: { full_name?: string } | null };
      if (cancelled) return;
      if (!j.isCleaner || !j.cleaner) {
        setBlocked("This account is not registered as a cleaner. Ask an admin to add your profile.");
        setLoading(false);
        return;
      }
      setName(j.cleaner.full_name ?? "Cleaner");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-center text-sm text-zinc-500">Loading…</p>
      </main>
    );
  }

  if (blocked) {
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {blocked}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Hi {name}</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Open <strong>Jobs</strong> to see assignments, accept work, and update progress in real time.
      </p>
      <Link
        href="/cleaner/jobs"
        className="mt-6 inline-flex rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm"
      >
        View jobs
      </Link>
    </main>
  );
}
