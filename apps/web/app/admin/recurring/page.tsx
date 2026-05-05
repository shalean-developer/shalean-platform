"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatIsoInJohannesburgYmd } from "@/lib/booking/dateInJohannesburg";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { emitAdminToast } from "@/lib/admin/toastBus";
import { CreateRecurringPlanDialog } from "@/components/admin/CreateRecurringPlanDialog";
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

type CronHealthJob = {
  job_name: string;
  last_success_at: string | null;
  last_run_at: string | null;
  errors_last_24h: number;
};

type CronHealthRecentError = {
  job_name: string;
  created_at: string;
  message: string;
};

function formatCronTs(iso: string | null): string {
  if (!iso?.trim()) return "—";
  try {
    return new Date(iso).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  } catch {
    return iso.slice(0, 16);
  }
}

export default function AdminRecurringPage() {
  const [rows, setRows] = useState<RecurringListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [cronHealth, setCronHealth] = useState<CronHealthJob[] | null>(null);
  const [cronRecentErrors, setCronRecentErrors] = useState<CronHealthRecentError[]>([]);

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

  useEffect(() => {
    let cancelled = false;
    async function loadCronHealth() {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/admin/cron-health", { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as { jobs?: CronHealthJob[]; recent_errors?: CronHealthRecentError[] };
      if (!cancelled && res.ok) {
        setCronHealth(json.jobs ?? []);
        setCronRecentErrors(Array.isArray(json.recent_errors) ? json.recent_errors : []);
      }
    }
    void loadCronHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  async function postBackfill(id: string) {
    if (
      !window.confirm(
        "Create missing recurring visit rows for one Johannesburg calendar month: from max(month-start, plan start) through month-end (same rules as the generator cron). Already-created dates are skipped; next_run_date is updated. You can target a past month in the next step (e.g. 2026-05).",
      )
    ) {
      return;
    }
    const monthRaw = window.prompt(
      "Optional: month to backfill as YYYY-MM (e.g. 2026-05). Leave empty for the current Johannesburg calendar month:",
      "",
    );
    if (monthRaw === null) return;
    const monthYm = monthRaw.trim();
    if (monthYm && !/^\d{4}-\d{2}$/.test(monthYm)) {
      emitAdminToast("Invalid month — use YYYY-MM or leave empty.", "error");
      return;
    }
    const qs = monthYm ? `?month=${encodeURIComponent(monthYm)}` : "";
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      emitAdminToast("Sign in as admin.", "error");
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/recurring/${encodeURIComponent(id)}/backfill-occurrences${qs}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        error?: string;
        generated?: number;
        skipped_duplicate?: number;
        skipped_other?: number;
        dates_considered?: number;
        from_ymd?: string;
        through_ymd?: string;
        campaign_floor_ymd?: string;
        invoice_month_ym?: string;
        truncated?: boolean;
        next_run_date?: string;
        failures?: { date: string; error: string }[];
      };
      if (!res.ok) {
        emitAdminToast(json.error ?? "Backfill failed", "error");
        return;
      }
      const g = json.generated ?? 0;
      const dup = json.skipped_duplicate ?? 0;
      const so = json.skipped_other ?? 0;
      const dc = json.dates_considered ?? 0;
      const win =
        json.from_ymd && json.through_ymd ? `Window ${json.from_ymd}→${json.through_ymd} (${dc} dates).` : "";
      const trunc = json.truncated ? " Hit max dates — run again if needed." : "";
      let detail = `Backfill: +${g} created · ${dup} already existed · ${so} other skips. ${win}${trunc}`.trim();
      if (g === 0 && dup === 0 && dc === 0) {
        detail +=
          " No schedule dates in this range — check start_date / end_date, skip-next flag, or weekdays (weekly/biweekly with no weekdays creates nothing).";
      }
      emitAdminToast(detail, "success");
      if ((json.failures?.length ?? 0) > 0) {
        emitAdminToast(`Some dates failed: ${json.failures?.[0]?.error ?? "see logs"}`, "error");
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function postBatchBackfillMayToToday() {
    if (
      !window.confirm(
        "Run month-window backfill on ALL active recurring plans (per_booking or monthly; missing profile defaults to per_booking). Same date rules as the generator cron. This can take a while. Existing dates are skipped; next_run_date is updated per plan.",
      )
    ) {
      return;
    }
    const monthRaw = window.prompt(
      "Optional: month for ALL plans as YYYY-MM (e.g. 2026-05 to repair legacy May). Leave empty for current Johannesburg month:",
      "",
    );
    if (monthRaw === null) return;
    const monthYm = monthRaw.trim();
    if (monthYm && !/^\d{4}-\d{2}$/.test(monthYm)) {
      emitAdminToast("Invalid month — use YYYY-MM or leave empty.", "error");
      return;
    }
    const qs = monthYm ? `?month=${encodeURIComponent(monthYm)}` : "";
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      emitAdminToast("Sign in as admin.", "error");
      return;
    }
    setBatchBusy(true);
    try {
      const res = await fetch(`/api/admin/recurring-batch-backfill-may-to-today${qs}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        error?: string;
        invoice_month_ym?: string | null;
        plans_processed?: number;
        plans_eligible?: number;
        totals?: { generated?: number; skipped_duplicate?: number; skipped_other?: number };
        plan_failures?: { recurring_id: string; error: string }[];
        truncated_by_limit?: boolean;
        limit_applied?: number | null;
      };
      if (!res.ok) {
        emitAdminToast(json.error ?? "Batch backfill failed", "error");
        return;
      }
      const t = json.totals ?? {};
      const g = t.generated ?? 0;
      const dup = t.skipped_duplicate ?? 0;
      const so = t.skipped_other ?? 0;
      const pf = json.plan_failures?.length ?? 0;
      const lim =
        json.truncated_by_limit && json.limit_applied != null
          ? ` (stopped at limit ${json.limit_applied} — call again with ?limit= or raise limit)`
          : "";
      emitAdminToast(
        `Batch: ${json.plans_processed ?? 0}/${json.plans_eligible ?? 0} plans · +${g} bookings · ${dup} duplicates · ${so} other skips${lim}`,
        "success",
      );
      if (pf > 0) {
        emitAdminToast(`${pf} plan(s) failed (first: ${json.plan_failures?.[0]?.error ?? "?"})`, "error");
      }
      await load();
    } finally {
      setBatchBusy(false);
    }
  }

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
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)} disabled={batchBusy}>
            New recurring plan
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading || batchBusy}>
            Refresh
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={loading || batchBusy || busyId != null}
            onClick={() => void postBatchBackfillMayToToday()}
          >
            Backfill all (month window)
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
          <CardTitle>Cron health (24h)</CardTitle>
          <CardDescription>
            From <code className="text-xs">cron_runs</code> — generator + charger jobs after migrations apply.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!cronHealth?.length ? (
            <p className="text-sm text-zinc-500">No runs recorded yet, or table not migrated.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {cronHealth.map((j) => (
                <li
                  key={j.job_name}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60"
                >
                  <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{j.job_name}</span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    Last success: <span className="font-medium text-zinc-900 dark:text-zinc-100">{formatCronTs(j.last_success_at)}</span>
                    {" · "}
                    Errors 24h:{" "}
                    <span className={j.errors_last_24h > 0 ? "font-semibold text-amber-700 dark:text-amber-300" : ""}>
                      {j.errors_last_24h}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {cronRecentErrors.length > 0 ? (
            <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">Recent errors (newest first)</p>
              <ul className="max-h-60 space-y-2 overflow-y-auto text-xs">
                {cronRecentErrors.map((e, i) => (
                  <li
                    key={`${e.created_at}-${e.job_name}-${i}`}
                    className="rounded border border-amber-200/80 bg-amber-50/80 px-2 py-1.5 font-mono text-zinc-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-zinc-200"
                  >
                    <span className="text-zinc-500 dark:text-zinc-400">{formatCronTs(e.created_at)}</span>{" "}
                    <span className="text-zinc-600 dark:text-zinc-400">{e.job_name}</span>
                    <div className="mt-0.5 break-all text-[11px]">{e.message}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-zinc-200 shadow-sm dark:border-zinc-800">
        <CardHeader>
          <CardTitle>All plans</CardTitle>
          <CardDescription>
            Pause stops new generated bookings; resume recalculates <code className="text-xs">next_run_date</code>. Customer
            must already have a Supabase account (matching email) before you attach a plan.
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
                          {(r.days_of_week?.length ?? 0) === 0 &&
                          ["weekly", "biweekly"].includes(String(r.frequency).toLowerCase()) ? (
                            <div className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                              No weekdays — planner cannot create visits until set.
                            </div>
                          ) : null}
                          {r.monthly_pattern && r.frequency.toLowerCase() === "monthly" ? (
                            <div className="text-[11px] text-zinc-400">{r.monthly_pattern}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 align-top tabular-nums text-zinc-800 dark:text-zinc-200">
                          <div>{r.next_run_date || "—"}</div>
                          {skipNote ? <div className="text-xs text-amber-700 dark:text-amber-300">{skipNote}</div> : null}
                          {r.last_generated_at ? (
                            <div className="text-[11px] text-zinc-400">
                              Last gen (JHB): {formatIsoInJohannesburgYmd(r.last_generated_at)}
                            </div>
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
                                variant="secondary"
                                disabled={busyId === r.id || batchBusy}
                                onClick={() => void postBackfill(r.id)}
                              >
                                Backfill to today
                              </Button>
                            ) : null}
                            {canPause ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busyId === r.id || batchBusy}
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
                                disabled={busyId === r.id || batchBusy}
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
                                disabled={busyId === r.id || batchBusy}
                                onClick={() => void postAction(r.id, "cancel")}
                              >
                                Cancel
                              </Button>
                            ) : null}
                            <Link
                              href={`/admin/bookings?recurring_id=${encodeURIComponent(r.id)}`}
                              className="inline-flex h-8 items-center rounded-md border border-zinc-300 bg-white px-2 text-xs font-medium text-blue-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-blue-300 dark:hover:bg-zinc-800"
                            >
                              Bookings
                            </Link>
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

      <CreateRecurringPlanDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void load()} />
    </div>
  );
}
