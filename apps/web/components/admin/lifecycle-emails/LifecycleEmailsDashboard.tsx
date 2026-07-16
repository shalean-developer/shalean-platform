"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { emitAdminToast } from "@/lib/admin/toastBus";
import { adminFetch } from "@/hooks/useAdminData";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type JobRow = {
  id: string;
  booking_id: string;
  customer_email: string;
  job_type: string;
  scheduled_for: string;
  status: string;
  attempts: number;
  sent_at: string | null;
  processed_at: string | null;
  last_error: string | null;
  skipped_reason: string | null;
  customer_type?: "once_off" | "recurring";
  has_active_recurring_plan?: boolean;
  has_future_booking?: boolean;
};

type Summary = {
  pending: number;
  sent: number;
  failed_retryable: number;
  failed_terminal: number;
  cancelled: number;
  skipped: number;
  due_today: number;
  due_next_7d: number;
};

type Settings = {
  emails_enabled: boolean;
  dry_run_enabled: boolean;
  frequency_limit_enabled: boolean;
  paused_by_env?: boolean;
  dry_run_by_env?: boolean;
};

type AlertRow = {
  id: string;
  type: string;
  severity: string;
  fired_at: string;
  context?: Record<string, unknown>;
};

type Analytics = {
  sentToday: number;
  sentWeek: number;
  deliverySuccessRate: number | null;
  failureRate: number | null;
  skipRate: number | null;
  reviewConversionRate: number | null;
  rebookConversionRate: number | null;
  topFailureReasons: { reason: string; count: number }[];
  dailyTrend: { date: string; job_type: string; sent_count: number; failed_count: number; skipped_count: number }[];
};

const STATUSES = [
  "",
  "pending",
  "processing",
  "sent",
  "cancelled",
  "skipped",
  "failed_retryable",
  "failed_terminal",
] as const;

const JOB_TYPES = ["", "reminder_24h", "review_request", "rebook_offer", "rebook_reminder", "rebook"] as const;
const CUSTOMER_TYPES = ["", "once_off", "recurring"] as const;
const QUEUE_FILTERS = ["", "due", "future"] as const;

export type LifecycleEmailsRoutePrefix = "/office" | "/admin";

type Props = {
  routePrefix?: LifecycleEmailsRoutePrefix;
};

function statusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case "sent":
      return "success";
    case "failed_retryable":
      return "warning";
    case "failed_terminal":
      return "destructive";
    case "skipped":
      return "outline";
    case "processing":
      return "default";
    default:
      return "outline";
  }
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function cronStale(lastSuccess: string | null): boolean {
  if (!lastSuccess) return true;
  return Date.now() - Date.parse(lastSuccess) > 30 * 60_000;
}

export function LifecycleEmailsDashboard({ routePrefix = "/office" }: Props) {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [cronLastSuccess, setCronLastSuccess] = useState<string | null>(null);
  const [cronHealthStatus, setCronHealthStatus] = useState<string | null>(null);
  const [cronStaleAfterMinutes, setCronStaleAfterMinutes] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  const [draftStatus, setDraftStatus] = useState("");
  const [draftJobType, setDraftJobType] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [draftDateFrom, setDraftDateFrom] = useState("");
  const [draftDateTo, setDraftDateTo] = useState("");
  const [draftCustomerType, setDraftCustomerType] = useState("");
  const [draftQueue, setDraftQueue] = useState("");
  const [draftSkippedReason, setDraftSkippedReason] = useState("");

  const [appliedStatus, setAppliedStatus] = useState("");
  const [appliedJobType, setAppliedJobType] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo] = useState("");
  const [appliedCustomerType, setAppliedCustomerType] = useState("");
  const [appliedQueue, setAppliedQueue] = useState("");
  const [appliedSkippedReason, setAppliedSkippedReason] = useState("");

  const [confirmAction, setConfirmAction] = useState<"pause" | "resume" | "dry_on" | "dry_off" | null>(null);
  const [testJobType, setTestJobType] = useState("reminder_24h");
  const [sendingTest, setSendingTest] = useState(false);
  const [updatingSettings, setUpdatingSettings] = useState(false);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", "60");
    p.set("offset", String(offset));
    if (appliedStatus) p.set("status", appliedStatus);
    if (appliedJobType) p.set("job_type", appliedJobType);
    if (appliedSearch.trim()) p.set("search", appliedSearch.trim());
    if (appliedDateFrom) p.set("date_from", appliedDateFrom);
    if (appliedDateTo) p.set("date_to", appliedDateTo);
    if (appliedCustomerType) p.set("customer_type", appliedCustomerType);
    if (appliedQueue) p.set("queue", appliedQueue);
    if (appliedSkippedReason.trim()) p.set("skipped_reason", appliedSkippedReason.trim());
    return p.toString();
  }, [offset, appliedStatus, appliedJobType, appliedSearch, appliedDateFrom, appliedDateTo, appliedCustomerType, appliedQueue, appliedSkippedReason]);

  const load = useCallback(async () => {
    setLoading(true);
    const [listRes, analyticsRes] = await Promise.all([
      adminFetch<{
        jobs?: JobRow[];
        hasMore?: boolean;
        summary?: Summary;
        settings?: Settings;
        cron?: {
          last_success_at?: string | null;
          health_status?: string | null;
          stale_after_minutes?: number | null;
        };
        alerts?: AlertRow[];
        error?: string;
      }>(`/api/admin/lifecycle-emails?${queryString}`),
      adminFetch<Analytics>("/api/admin/lifecycle-emails/analytics"),
    ]);

    if (!listRes.ok) {
      emitAdminToast(listRes.error ?? "Could not load lifecycle emails.", "error");
      setJobs([]);
    } else {
      const listJson = listRes.data ?? {};
      setJobs(listJson.jobs ?? []);
      setHasMore(Boolean(listJson.hasMore));
      setSummary(listJson.summary ?? null);
      setSettings(listJson.settings ?? null);
      setCronLastSuccess(listJson.cron?.last_success_at ?? null);
      setCronHealthStatus(listJson.cron?.health_status ?? null);
      setCronStaleAfterMinutes(
        typeof listJson.cron?.stale_after_minutes === "number"
          ? listJson.cron.stale_after_minutes
          : null,
      );
      setAlerts(listJson.alerts ?? []);
    }
    if (analyticsRes.ok) setAnalytics(analyticsRes.data ?? null);
    setLoading(false);
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchSettings(patch: Partial<Settings>) {
    setUpdatingSettings(true);
    try {
      const res = await adminFetch("/api/admin/lifecycle-emails/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        emitAdminToast(res.error ?? "Settings update failed.", "error");
      } else {
        emitAdminToast("Settings updated.", "success");
        await load();
      }
    } finally {
      setUpdatingSettings(false);
      setConfirmAction(null);
    }
  }

  async function sendTestEmail() {
    setSendingTest(true);
    try {
      const res = await adminFetch<{ sent_to?: string }>("/api/admin/lifecycle-emails/test", {
        method: "POST",
        body: JSON.stringify({ job_type: testJobType }),
      });
      if (!res.ok) emitAdminToast(res.error ?? "Test send failed.", "error");
      else emitAdminToast(`Test email sent to ${res.data?.sent_to ?? "your inbox"}.`, "success");
    } finally {
      setSendingTest(false);
    }
  }

  async function resolveAlert(alertId: string) {
    const res = await adminFetch(`/api/admin/notification-alerts/${alertId}`, {
      method: "PATCH",
      body: JSON.stringify({ resolved: true }),
    });
    if (res.ok) {
      emitAdminToast("Alert resolved.", "success");
      await load();
    }
  }

  function applyFilters() {
    setAppliedStatus(draftStatus);
    setAppliedJobType(draftJobType);
    setAppliedSearch(draftSearch.trim());
    setAppliedDateFrom(draftDateFrom);
    setAppliedDateTo(draftDateTo);
    setAppliedCustomerType(draftCustomerType);
    setAppliedQueue(draftQueue);
    setAppliedSkippedReason(draftSkippedReason.trim());
    setOffset(0);
  }

  function clearFilters() {
    setDraftStatus("");
    setDraftJobType("");
    setDraftSearch("");
    setDraftDateFrom("");
    setDraftDateTo("");
    setDraftCustomerType("");
    setDraftQueue("");
    setDraftSkippedReason("");
    setAppliedStatus("");
    setAppliedJobType("");
    setAppliedSearch("");
    setAppliedDateFrom("");
    setAppliedDateTo("");
    setAppliedCustomerType("");
    setAppliedQueue("");
    setAppliedSkippedReason("");
    setOffset(0);
  }

  const paused = settings && !settings.emails_enabled;
  const dryRun = settings?.dry_run_enabled ?? false;
  const staleCron =
    cronHealthStatus === "stale" ||
    cronHealthStatus === "never_run" ||
    (cronHealthStatus == null && cronStale(cronLastSuccess));
  const staleThresholdLabel =
    cronStaleAfterMinutes != null
      ? cronStaleAfterMinutes >= 60
        ? `${Math.round(cronStaleAfterMinutes / 60)}+ hours`
        : `${cronStaleAfterMinutes}+ minutes`
      : "expected window";

  const dailyChart = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const row of analytics?.dailyTrend ?? []) {
      byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.sent_count);
    }
    return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [analytics?.dailyTrend]);

  const maxChart = Math.max(1, ...dailyChart.map(([, v]) => v));

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lifecycle emails</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Scheduled reminder, review, and rebook emails via Resend. Monitor queue health, pause sends, or dry-run
            without affecting cron scheduling.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href={`${routePrefix}/notifications`} className="font-medium text-blue-600 hover:underline">
            Notifications
          </Link>
          <Link href={`${routePrefix}/notification-logs`} className="font-medium text-blue-600 hover:underline">
            Delivery logs
          </Link>
          <Link href={`${routePrefix}/ops-health`} className="font-medium text-blue-600 hover:underline">
            Ops health
          </Link>
        </div>
      </div>

      {paused && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
          Lifecycle emails are currently paused.
          {settings?.paused_by_env ? " (Env override: LIFECYCLE_EMAILS_ENABLED=false)" : ""}
        </div>
      )}

      {dryRun && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Dry run mode is active — jobs are evaluated and logged but not sent via Resend.
          {settings?.dry_run_by_env ? " (Env override: LIFECYCLE_EMAILS_DRY_RUN=true)" : ""}
        </div>
      )}

      {staleCron && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          booking-lifecycle cron has not succeeded within the {staleThresholdLabel} health window
          {cronHealthStatus ? ` (${cronHealthStatus})` : ""}. Last success: {fmtTime(cronLastSuccess)}
        </div>
      )}

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {(
            [
              ["Pending", summary.pending],
              ["Sent", summary.sent],
              ["Failed (retry)", summary.failed_retryable],
              ["Failed (terminal)", summary.failed_terminal],
              ["Cancelled", summary.cancelled],
              ["Skipped", summary.skipped],
              ["Due today", summary.due_today],
            ] as const
          ).map(([label, value]) => (
            <Card key={label} className="border-slate-200">
              <CardHeader className="pb-2">
                <CardDescription>{label}</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Controls</CardTitle>
            <CardDescription>Pause all lifecycle sends or enable dry-run logging.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant={paused ? "default" : "outline"}
              disabled={updatingSettings || Boolean(settings?.paused_by_env)}
              onClick={() => setConfirmAction(paused ? "resume" : "pause")}
            >
              {paused ? "Resume emails" : "Pause all emails"}
            </Button>
            <Button
              variant={dryRun ? "default" : "outline"}
              disabled={updatingSettings || Boolean(settings?.dry_run_by_env)}
              onClick={() => setConfirmAction(dryRun ? "dry_off" : "dry_on")}
            >
              {dryRun ? "Disable dry run" : "Enable dry run"}
            </Button>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              Refresh
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Send test email</CardTitle>
            <CardDescription>Sends a preview to your admin email. Does not modify production jobs.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2">
            <Select label="Job type" value={testJobType} onChange={(e) => setTestJobType(e.target.value)}>
              {JOB_TYPES.filter(Boolean).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Button onClick={() => void sendTestEmail()} disabled={sendingTest}>
              {sendingTest ? "Sending…" : "Send test"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {analytics && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Analytics</CardTitle>
            <CardDescription>Delivery and conversion metrics for lifecycle emails.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500">Sent today</p>
                <p className="text-lg font-semibold tabular-nums">{analytics.sentToday}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Sent this week</p>
                <p className="text-lg font-semibold tabular-nums">{analytics.sentWeek}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Delivery success rate</p>
                <p className="text-lg font-semibold tabular-nums">
                  {analytics.deliverySuccessRate != null ? `${analytics.deliverySuccessRate}%` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Review conversion</p>
                <p className="text-lg font-semibold tabular-nums">
                  {analytics.reviewConversionRate != null ? `${analytics.reviewConversionRate}%` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Rebook conversion</p>
                <p className="text-lg font-semibold tabular-nums">
                  {analytics.rebookConversionRate != null ? `${analytics.rebookConversionRate}%` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Failure rate</p>
                <p className="text-lg font-semibold tabular-nums">
                  {analytics.failureRate != null ? `${analytics.failureRate}%` : "—"}
                </p>
              </div>
            </div>
            {dailyChart.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-slate-500">Daily sends (7d rollup)</p>
                <div className="flex h-24 items-end gap-1">
                  {dailyChart.map(([date, count]) => (
                    <div key={date} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t bg-blue-500"
                        style={{ height: `${Math.max(4, (count / maxChart) * 100)}%` }}
                        title={`${date}: ${count}`}
                      />
                      <span className="text-[10px] text-slate-500">{date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {analytics.topFailureReasons.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">Top failure reasons</p>
                <ul className="text-sm text-slate-700">
                  {analytics.topFailureReasons.map((r) => (
                    <li key={r.reason}>
                      {r.reason} <span className="text-slate-500">({r.count})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Open alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((a) => (
              <div
                key={a.id}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{a.type}</p>
                  <p className="text-xs text-slate-500">
                    {a.severity} · {fmtTime(a.fired_at)}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void resolveAlert(a.id)}>
                  Resolve
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Filter by status, job type, customer category, queue, or scheduled date.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select label="Status" value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)}>
              <option value="">Any</option>
              {STATUSES.filter(Boolean).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <Select label="Job type" value={draftJobType} onChange={(e) => setDraftJobType(e.target.value)}>
              <option value="">Any</option>
              {JOB_TYPES.filter(Boolean).map((t) => (
                <option key={t} value={t}>
                  {t === "rebook" ? "rebook (offer + reminder)" : t}
                </option>
              ))}
            </Select>
            <Select label="Customer type" value={draftCustomerType} onChange={(e) => setDraftCustomerType(e.target.value)}>
              <option value="">Any</option>
              {CUSTOMER_TYPES.filter(Boolean).map((t) => (
                <option key={t} value={t}>
                  {t === "once_off" ? "Once-off" : "Recurring"}
                </option>
              ))}
            </Select>
            <Select label="Queue" value={draftQueue} onChange={(e) => setDraftQueue(e.target.value)}>
              <option value="">Any</option>
              {QUEUE_FILTERS.filter(Boolean).map((t) => (
                <option key={t} value={t}>
                  {t === "due" ? "Due now" : "Future scheduled"}
                </option>
              ))}
            </Select>
            <div className="space-y-2">
              <Label htmlFor="f-search">Search</Label>
              <Input
                id="f-search"
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
                placeholder="Email, booking ID, error"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="f-from">Scheduled from</Label>
              <Input id="f-from" type="date" value={draftDateFrom} onChange={(e) => setDraftDateFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="f-skipped">Skip reason</Label>
              <Input
                id="f-skipped"
                value={draftSkippedReason}
                onChange={(e) => setDraftSkippedReason(e.target.value)}
                placeholder="e.g. customer_has_future_booking"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="f-to">Scheduled to</Label>
              <Input id="f-to" type="date" value={draftDateTo} onChange={(e) => setDraftDateTo(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={applyFilters}>Apply</Button>
            <Button variant="outline" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Jobs</CardTitle>
          <CardDescription>
            {summary ? `${summary.due_next_7d} jobs due in the next 7 days.` : "Scheduled lifecycle email jobs."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-slate-500">No jobs match filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Booking</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Recurring</TableHead>
                  <TableHead>Future bk</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Processed</TableHead>
                  <TableHead>Skip / error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="whitespace-nowrap text-xs">{fmtTime(job.scheduled_for)}</TableCell>
                    <TableCell className="text-xs">{job.job_type}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(job.status)}>{job.status}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-xs">{job.customer_email}</TableCell>
                    <TableCell>
                      <Link
                        href={`${routePrefix}/bookings/${job.booking_id}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {job.booking_id.slice(0, 8)}…
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs capitalize">{job.customer_type ?? "—"}</TableCell>
                    <TableCell className="text-xs">{job.has_active_recurring_plan ? "yes" : "no"}</TableCell>
                    <TableCell className="text-xs">{job.has_future_booking ? "yes" : "no"}</TableCell>
                    <TableCell className="tabular-nums">{job.attempts}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmtTime(job.sent_at)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmtTime(job.processed_at)}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-slate-600">
                      {job.skipped_reason ?? job.last_error ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 60))}>
              Previous
            </Button>
            <Button variant="outline" disabled={!hasMore} onClick={() => setOffset(offset + 60)}>
              Next
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmAction != null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm action</DialogTitle>
            <DialogDescription>
              {confirmAction === "pause" && "Pause all lifecycle emails? Cron will still run but no emails will be sent."}
              {confirmAction === "resume" && "Resume lifecycle email sending?"}
              {confirmAction === "dry_on" && "Enable dry run? Jobs will be evaluated and logged but not sent via Resend."}
              {confirmAction === "dry_off" && "Disable dry run and resume normal sending?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              disabled={updatingSettings}
              onClick={() => {
                if (confirmAction === "pause") void patchSettings({ emails_enabled: false });
                else if (confirmAction === "resume") void patchSettings({ emails_enabled: true });
                else if (confirmAction === "dry_on") void patchSettings({ dry_run_enabled: true });
                else if (confirmAction === "dry_off") void patchSettings({ dry_run_enabled: false });
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
