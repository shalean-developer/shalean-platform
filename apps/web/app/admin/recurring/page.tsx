"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { emitAdminToast } from "@/lib/admin/toastBus";
import StatusBadge from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

export type RecurringListRow = {
  id: string;
  customer_id: string;
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
  customer_email: string | null;
  customer_name: string | null;
  template_visit_date: string | null;
  template_visit_time: string | null;
  template_location: string | null;
};

function statusTone(status: string): "green" | "amber" | "red" | "zinc" {
  const s = status.toLowerCase();
  if (s === "active") return "green";
  if (s === "paused") return "amber";
  if (s === "cancelled") return "red";
  return "zinc";
}

export default function AdminRecurringPage() {
  const [rows, setRows] = useState<RecurringListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      setError("Not signed in.");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/admin/recurring", { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as { recurring?: RecurringListRow[]; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Failed to load recurring plans.");
      setRows([]);
    } else {
      setRows(json.recurring ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const tid = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(tid);
  }, [load]);

  async function postAction(id: string, action: "pause" | "resume" | "cancel") {
    if (action === "cancel" && !window.confirm("Cancel this recurring plan? Generated visits may still exist.")) {
      return;
    }
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      emitAdminToast("Sign in as admin.", "error");
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/recurring/${id}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        emitAdminToast(json.error ?? "Request failed", "error");
        return;
      }
      emitAdminToast(action === "cancel" ? "Plan cancelled" : action === "pause" ? "Plan paused" : "Plan resumed", "success");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Recurring plans</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Active schedules, next generator run (Africa/Johannesburg), and snapshot preview from each plan.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
          <Link
            href="/admin/bookings"
            className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Bookings
          </Link>
        </div>
      </div>

      <Card className="border-zinc-200 shadow-sm dark:border-zinc-800">
        <CardHeader>
          <CardTitle>All plans</CardTitle>
          <CardDescription>
            Pause stops new generated bookings; resume recalculates <code className="text-xs">next_run_date</code>. Create
            plans via <code className="text-xs">POST /api/admin/recurring</code> until a guided form ships.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-zinc-500">No recurring plans yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="min-w-[920px] w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">Customer</th>
                    <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">Frequency</th>
                    <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">Next run</th>
                    <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">Preview</th>
                    <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">Price</th>
                    <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">Status</th>
                    <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const st = r.status.toLowerCase();
                    const canPause = st === "active";
                    const canResume = st === "paused";
                    const canCancel = st === "active" || st === "paused";
                    const customer =
                      r.customer_email?.trim() ||
                      r.customer_name?.trim() ||
                      `${r.customer_id.slice(0, 8)}…`;
                    const previewParts = [
                      r.template_visit_date && r.template_visit_time
                        ? `${r.template_visit_date} ${r.template_visit_time}`
                        : r.template_visit_date || null,
                      r.template_location ? r.template_location : null,
                    ].filter(Boolean);
                    const preview = previewParts.length ? previewParts.join(" · ") : "—";
                    const skipNote = r.skip_next_occurrence_date
                      ? `Skip: ${r.skip_next_occurrence_date}`
                      : null;
                    return (
                      <tr key={r.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/80">
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium text-zinc-900 dark:text-zinc-100">{customer}</div>
                          {r.customer_email && r.customer_name ? (
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">{r.customer_name}</div>
                          ) : null}
                          <div className="mt-0.5 font-mono text-[11px] text-zinc-400">{r.id.slice(0, 8)}…</div>
                        </td>
                        <td className="px-3 py-2 align-top text-zinc-700 dark:text-zinc-300">
                          <div>{frequencyLabel(r.frequency)}</div>
                          <div className="text-xs text-zinc-500">{formatDays(r.days_of_week)}</div>
                          {r.monthly_pattern && r.frequency.toLowerCase() === "monthly" ? (
                            <div className="text-[11px] text-zinc-400">{r.monthly_pattern}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 align-top tabular-nums text-zinc-800 dark:text-zinc-200">
                          <div>{r.next_run_date || "—"}</div>
                          {skipNote ? <div className="text-xs text-amber-700 dark:text-amber-300">{skipNote}</div> : null}
                          {r.last_generated_at ? (
                            <div className="text-[11px] text-zinc-400">Last gen: {r.last_generated_at.slice(0, 10)}</div>
                          ) : null}
                        </td>
                        <td className="max-w-[240px] px-3 py-2 align-top text-xs text-zinc-600 dark:text-zinc-400">
                          {preview}
                        </td>
                        <td className="px-3 py-2 align-top tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
                          R {Math.round(Number(r.price) || 0).toLocaleString("en-ZA")}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <StatusBadge label={r.status} tone={statusTone(r.status)} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-wrap gap-1.5">
                            {canPause ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busyId === r.id}
                                onClick={() => void postAction(r.id, "pause")}
                              >
                                Pause
                              </Button>
                            ) : null}
                            {canResume ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busyId === r.id}
                                onClick={() => void postAction(r.id, "resume")}
                              >
                                Resume
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
                                Cancel
                              </Button>
                            ) : null}
                            {!canPause && !canResume && !canCancel ? (
                              <span className="text-xs text-zinc-400">—</span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
