"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import StatusBadge from "@/components/admin/StatusBadge";
import { useDashboardToast } from "@/components/dashboard/dashboard-toast-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function formatDays(days: number[]): string {
  const uniq = [...new Set(days.filter((d) => d >= 1 && d <= 7))].sort((a, b) => a - b);
  return uniq.map((d) => WEEKDAY_SHORT[d - 1]).join(", ");
}

function frequencyLabel(f: string): string {
  const x = f.toLowerCase();
  if (x === "weekly") return "Weekly";
  if (x === "biweekly") return "Biweekly";
  if (x === "monthly") return "Monthly";
  return f || "—";
}

function formatHm(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const t = raw.trim();
  if (/^\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
  return t || null;
}

function statusTone(status: string): "green" | "amber" | "red" | "zinc" {
  const s = status.toLowerCase();
  if (s === "active") return "green";
  if (s === "paused") return "amber";
  if (s === "cancelled") return "red";
  return "zinc";
}

type MeRecurringItem = {
  id: string;
  address_id: string | null;
  frequency: string;
  days_of_week: number[];
  start_date: string | null;
  end_date: string | null;
  price: number;
  status: string;
  next_run_date: string;
  last_generated_at: string | null;
  skip_next_occurrence_date: string | null;
  monthly_pattern: string;
  monthly_nth: number | null;
  created_at: string | null;
  updated_at: string | null;
  template_visit_date: string | null;
  template_visit_time: string | null;
  template_location: string | null;
  upcoming_bookings: {
    id: string;
    recurring_id: string | null;
    date: string | null;
    time: string | null;
    status: string | null;
    location: string | null;
    payment_status: string | null;
  }[];
};

export default function AccountRecurringPage() {
  const toast = useDashboardToast();
  const [items, setItems] = useState<MeRecurringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      setError("Sign in to view recurring plans.");
      setItems([]);
      setLoading(false);
      return;
    }
    const res = await fetch("/api/me/recurring", { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as { ok?: boolean; items?: MeRecurringItem[]; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Could not load recurring plans.");
      setItems([]);
    } else {
      setItems(json.items ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const tid = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(tid);
  }, [load]);

  async function postAction(id: string, action: "pause" | "resume" | "cancel" | "skip") {
    if (action === "cancel" && !window.confirm("Cancel this plan? Future visits will not be scheduled.")) {
      return;
    }
    if (action === "skip" && !window.confirm("Skip the next scheduled visit?")) {
      return;
    }
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      toast("Sign in again.", "error");
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/me/recurring/${id}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast(json.error ?? "Something went wrong.", "error");
        return;
      }
      if (action === "cancel") toast("Plan cancelled.", "success");
      else if (action === "pause") toast("Plan paused.", "success");
      else if (action === "resume") toast("Plan resumed.", "success");
      else toast("Next visit skipped.", "success");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Recurring cleaning</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Manage your schedule, skip a visit, or pause anytime. Charges run automatically for generated visits.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle>No recurring plans yet</CardTitle>
            <CardDescription>
              When you subscribe to a recurring clean, it will show here. You can also book one-off visits from your
              dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/bookings"
              className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              View bookings →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-6">
          {items.map((r) => {
            const st = r.status.toLowerCase();
            const canPause = st === "active";
            const canResume = st === "paused";
            const canCancel = st === "active" || st === "paused";
            const visitHm = formatHm(r.template_visit_time);
            const scheduleLine = [frequencyLabel(r.frequency), formatDays(r.days_of_week), visitHm ? visitHm : null]
              .filter(Boolean)
              .join(" · ");
            const nextLine =
              r.next_run_date && visitHm
                ? `${r.next_run_date} · ${visitHm}`
                : r.next_run_date || visitHm || "—";
            const skipQueued = Boolean(r.skip_next_occurrence_date?.trim());
            const canSkip = st === "active" && Boolean(r.next_run_date) && !skipQueued;

            return (
              <li key={r.id}>
                <Card className="border-zinc-200 shadow-sm dark:border-zinc-800">
                  <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-2">
                    <div>
                      <CardTitle className="text-lg">Plan</CardTitle>
                      <CardDescription className="mt-1 font-mono text-xs text-zinc-500">{r.id.slice(0, 8)}…</CardDescription>
                    </div>
                    <StatusBadge label={r.status} tone={statusTone(r.status)} />
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Schedule</p>
                        <p className="mt-0.5 text-zinc-800 dark:text-zinc-200">{scheduleLine}</p>
                        {r.monthly_pattern && r.frequency.toLowerCase() === "monthly" ? (
                          <p className="mt-1 text-xs text-zinc-500">{r.monthly_pattern}</p>
                        ) : null}
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Next generator run</p>
                        <p className="mt-0.5 tabular-nums text-zinc-800 dark:text-zinc-200">{nextLine}</p>
                        {skipQueued ? (
                          <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                            Next visit skipped ({r.skip_next_occurrence_date})
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Price</p>
                        <p className="mt-0.5 font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                          R {Math.round(Number(r.price) || 0).toLocaleString("en-ZA")} <span className="font-normal text-zinc-500">per visit</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Address</p>
                        <p className="mt-0.5 text-zinc-800 dark:text-zinc-200">{r.template_location?.trim() || "—"}</p>
                      </div>
                    </div>

                    {r.upcoming_bookings.length > 0 ? (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Upcoming generated visits</p>
                        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                          <table className="w-full min-w-[280px] text-left text-xs">
                            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
                              <tr>
                                <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">Date</th>
                                <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">Time</th>
                                <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">Status</th>
                                <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">Payment</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.upcoming_bookings.map((b) => (
                                <tr key={b.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/80">
                                  <td className="px-3 py-2 tabular-nums text-zinc-800 dark:text-zinc-200">{b.date ?? "—"}</td>
                                  <td className="px-3 py-2 tabular-nums text-zinc-700 dark:text-zinc-300">{formatHm(b.time) ?? "—"}</td>
                                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{b.status ?? "—"}</td>
                                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{b.payment_status ?? "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="mt-2 text-xs text-zinc-500">
                          <Link href="/dashboard/bookings" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
                            Open all bookings
                          </Link>{" "}
                          to reschedule or pay a pending visit.
                        </p>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                      {canPause ? (
                        <Button type="button" size="sm" variant="outline" disabled={busyId === r.id} onClick={() => void postAction(r.id, "pause")}>
                          Pause
                        </Button>
                      ) : null}
                      {canResume ? (
                        <Button type="button" size="sm" variant="outline" disabled={busyId === r.id} onClick={() => void postAction(r.id, "resume")}>
                          Resume
                        </Button>
                      ) : null}
                      {canSkip ? (
                        <Button type="button" size="sm" variant="outline" disabled={busyId === r.id} onClick={() => void postAction(r.id, "skip")}>
                          Skip next visit
                        </Button>
                      ) : null}
                      {canCancel ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-rose-300 text-rose-800 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-200 dark:hover:bg-rose-950/40"
                          disabled={busyId === r.id}
                          onClick={() => void postAction(r.id, "cancel")}
                        >
                          Cancel plan
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
