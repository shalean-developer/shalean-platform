"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type SubscriptionRow = {
  id: string;
  service_type: string;
  frequency: "weekly" | "biweekly" | "monthly";
  time_slot: string;
  address: string;
  price_per_visit: number;
  status: "active" | "paused" | "cancelled";
  next_booking_date: string;
};

export default function AccountSubscriptionsPage() {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const sb = getSupabaseBrowser();
    const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
    const token = data.session?.access_token;
    if (!token) {
      setError("Please sign in.");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/subscriptions/me", { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as { subscriptions?: SubscriptionRow[]; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Failed to load subscriptions.");
      setLoading(false);
      return;
    }
    setRows(json.subscriptions ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(id: string, action: "pause" | "resume" | "cancel") {
    setBusyId(id);
    const sb = getSupabaseBrowser();
    const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/api/subscriptions/me", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    setBusyId(null);
    await load();
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <section className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">My Subscriptions</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Recurring cleaning plans and next visits.</p>
        </div>
        <Link href="/account/bookings" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Bookings</Link>
      </section>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading subscriptions...</p>
      ) : error ? (
        <p className="text-sm text-rose-700">{error}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          No subscriptions yet. Choose weekly, biweekly, or monthly in checkout.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((s) => (
            <article key={s.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">{s.service_type}</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                {s.frequency} · {s.time_slot} · Next: {s.next_booking_date}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{s.address}</p>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">R {Math.round(Number(s.price_per_visit ?? 0)).toLocaleString("en-ZA")} per visit</p>
              <div className="mt-3 flex gap-2">
                {s.status === "active" ? (
                  <button disabled={busyId === s.id} onClick={() => void act(s.id, "pause")} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white">
                    Pause
                  </button>
                ) : s.status === "paused" ? (
                  <button disabled={busyId === s.id} onClick={() => void act(s.id, "resume")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">
                    Resume
                  </button>
                ) : null}
                {s.status !== "cancelled" ? (
                  <button disabled={busyId === s.id} onClick={() => void act(s.id, "cancel")} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white">
                    Cancel
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
