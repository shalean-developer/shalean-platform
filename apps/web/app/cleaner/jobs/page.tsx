"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type JobRow = {
  id: string;
  service: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  status: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  total_paid_zar: number | null;
  assigned_at: string | null;
};

export default function CleanerJobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setError("Sign-in is not available.");
      setLoading(false);
      return;
    }
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      router.replace("/auth/login?next=/cleaner/jobs");
      return;
    }
    const res = await fetch("/api/cleaner/jobs", { headers: { Authorization: `Bearer ${token}` } });
    const j = (await res.json()) as { jobs?: JobRow[]; error?: string };
    if (!res.ok) {
      setError(j.error ?? "Could not load jobs.");
      setJobs([]);
      setLoading(false);
      return;
    }
    setError(null);
    setJobs(j.jobs ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;

    let cancelled = false;
    let ch: ReturnType<typeof sb.channel> | null = null;
    void sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const uid = data.session?.user?.id;
      if (!uid) return;
      ch = sb
        .channel(`cleaner-bookings-${uid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bookings", filter: `cleaner_id=eq.${uid}` },
          () => {
            void load();
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (ch) void sb.removeChannel(ch);
    };
  }, [load]);

  async function runAction(bookingId: string, action: string) {
    setActingId(bookingId);
    const sb = getSupabaseBrowser();
    const { data: sessionData } = await sb?.auth.getSession() ?? { data: { session: null } };
    const token = sessionData.session?.access_token;
    if (!token) {
      setActingId(null);
      return;
    }
    const res = await fetch(`/api/cleaner/jobs/${encodeURIComponent(bookingId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setActingId(null);
    if (res.ok) void load();
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-center text-sm text-zinc-500">Loading jobs…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          {error}
        </p>
      </main>
    );
  }

  const list = jobs ?? [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Your jobs</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Updates appear automatically when operations assigns work.
      </p>

      {list.length === 0 ? (
        <p className="mt-8 text-center text-sm text-zinc-500">No jobs yet — stay available to receive assignments.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {list.map((j) => {
            const st = (j.status ?? "").toLowerCase();
            const busy = actingId === j.id;
            return (
              <li
                key={j.id}
                className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-50">{j.service ?? "Cleaning"}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">
                      {j.date} {j.time}
                    </p>
                    {j.location ? (
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{j.location}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-zinc-500">
                      {j.customer_name ?? "Customer"} · {j.customer_phone ?? "—"}
                    </p>
                  </div>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold uppercase text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                    {j.status ?? "—"}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {st === "assigned" ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction(j.id, "accept")}
                        className="rounded-lg bg-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                      >
                        Acknowledge
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction(j.id, "reject")}
                        className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-800 dark:border-red-800 dark:text-red-200"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction(j.id, "en_route")}
                        className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white"
                      >
                        On the way
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction(j.id, "start")}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
                      >
                        Start job
                      </button>
                    </>
                  ) : null}
                  {st === "in_progress" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runAction(j.id, "complete")}
                      className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
                    >
                      Complete
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
