import type { SupabaseClient } from "@supabase/supabase-js";
import {
  recordNotificationAlertFired,
  type AlertSeverity,
} from "@/lib/admin/notificationMonitoring";
import { postDispatchControlAlert } from "@/lib/ops/dispatchControlWebhook";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export const LIFECYCLE_ALERT_KEYS = [
  "lifecycle_resend_failures_spike",
  "lifecycle_queue_backlog",
  "lifecycle_queue_overdue",
  "lifecycle_cron_stale",
] as const;

export type LifecycleAlertKey = (typeof LIFECYCLE_ALERT_KEYS)[number];

const COOLDOWN_MINUTES = 15;
const CRON_STALE_MINUTES = 30;
const FAILURE_SPIKE_WINDOW_MINUTES = 30;
const FAILURE_SPIKE_THRESHOLD = 5;
const BACKLOG_THRESHOLD = 100;
const OVERDUE_HOURS = 24;

async function canFireLifecycleAlert(admin: SupabaseClient, type: LifecycleAlertKey): Promise<boolean> {
  const since = new Date(Date.now() - COOLDOWN_MINUTES * 60_000).toISOString();
  const { data, error } = await admin
    .from("notification_alerts")
    .select("id")
    .eq("type", type)
    .is("resolved_at", null)
    .gte("fired_at", since)
    .limit(1);
  if (error) return true;
  return (data?.length ?? 0) === 0;
}

async function fireLifecycleAlert(params: {
  admin: SupabaseClient;
  alertKey: LifecycleAlertKey;
  severity: AlertSeverity;
  message: string;
  extra?: Record<string, unknown>;
}): Promise<void> {
  if (!(await canFireLifecycleAlert(params.admin, params.alertKey))) return;

  const level = params.severity === "critical" ? "critical" : params.severity === "error" ? "error" : "warn";
  await reportOperationalIssue(level, `lifecycle_email/${params.alertKey}`, params.message, {
    alertKey: params.alertKey,
    ...(params.extra ?? {}),
  });

  await recordNotificationAlertFired({
    admin: params.admin,
    alertKey: params.alertKey,
    severity: params.severity,
    days: 1,
    extra: params.extra,
  });

  await postDispatchControlAlert(
    {
      errorType: params.alertKey,
      message: params.message,
      dedupeKey: params.alertKey,
      dedupeWindowMinutes: COOLDOWN_MINUTES,
      extra: params.extra,
    },
    { supabase: params.admin },
  );
}

export type LifecycleMonitoringSnapshot = {
  pendingCount: number;
  oldestPendingScheduledFor: string | null;
  recentFailures: number;
  lastCronSuccessAt: string | null;
  alertsFired: string[];
};

export async function evaluateLifecycleEmailAlerts(
  admin: SupabaseClient,
): Promise<LifecycleMonitoringSnapshot> {
  const alertsFired: string[] = [];
  const now = Date.now();

  const [pendingRes, oldestRes, failuresRes, cronRes] = await Promise.all([
    admin.from("booking_lifecycle_jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin
      .from("booking_lifecycle_jobs")
      .select("scheduled_for")
      .eq("status", "pending")
      .order("scheduled_for", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from("booking_lifecycle_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["failed_retryable", "failed_terminal"])
      .gte("processed_at", new Date(now - FAILURE_SPIKE_WINDOW_MINUTES * 60_000).toISOString()),
    admin
      .from("cron_runs")
      .select("created_at")
      .eq("job_name", "booking-lifecycle")
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const pendingCount = pendingRes.count ?? 0;
  const oldestPendingScheduledFor =
    oldestRes.data && typeof oldestRes.data.scheduled_for === "string"
      ? oldestRes.data.scheduled_for
      : null;
  const recentFailures = failuresRes.count ?? 0;
  const lastCronSuccessAt =
    cronRes.data && typeof cronRes.data.created_at === "string" ? cronRes.data.created_at : null;

  if (recentFailures >= FAILURE_SPIKE_THRESHOLD) {
    alertsFired.push("lifecycle_resend_failures_spike");
    await fireLifecycleAlert({
      admin,
      alertKey: "lifecycle_resend_failures_spike",
      severity: "error",
      message: `${recentFailures} lifecycle email failures in the last ${FAILURE_SPIKE_WINDOW_MINUTES} minutes (threshold ${FAILURE_SPIKE_THRESHOLD})`,
      extra: { recentFailures, threshold: FAILURE_SPIKE_THRESHOLD, windowMinutes: FAILURE_SPIKE_WINDOW_MINUTES },
    });
  }

  if (pendingCount > BACKLOG_THRESHOLD) {
    alertsFired.push("lifecycle_queue_backlog");
    await fireLifecycleAlert({
      admin,
      alertKey: "lifecycle_queue_backlog",
      severity: "warn",
      message: `Lifecycle email backlog: ${pendingCount} pending jobs (threshold ${BACKLOG_THRESHOLD})`,
      extra: { pendingCount, threshold: BACKLOG_THRESHOLD },
    });
  }

  if (oldestPendingScheduledFor) {
    const overdueMs = now - Date.parse(oldestPendingScheduledFor);
    if (overdueMs > OVERDUE_HOURS * 60 * 60_000) {
      alertsFired.push("lifecycle_queue_overdue");
      await fireLifecycleAlert({
        admin,
        alertKey: "lifecycle_queue_overdue",
        severity: "warn",
        message: `Oldest pending lifecycle job is ${Math.round(overdueMs / 3_600_000)}h overdue`,
        extra: { oldestPendingScheduledFor, overdueHours: Math.round(overdueMs / 3_600_000) },
      });
    }
  }

  const cronStale =
    !lastCronSuccessAt || now - Date.parse(lastCronSuccessAt) > CRON_STALE_MINUTES * 60_000;
  if (cronStale) {
    alertsFired.push("lifecycle_cron_stale");
    await fireLifecycleAlert({
      admin,
      alertKey: "lifecycle_cron_stale",
      severity: "critical",
      message: `booking-lifecycle cron has not succeeded in ${CRON_STALE_MINUTES}+ minutes`,
      extra: { lastCronSuccessAt, staleMinutes: CRON_STALE_MINUTES },
    });
  }

  return {
    pendingCount,
    oldestPendingScheduledFor,
    recentFailures,
    lastCronSuccessAt,
    alertsFired,
  };
}

export async function fetchOpenLifecycleAlerts(admin: SupabaseClient, limit = 20) {
  const { data, error } = await admin
    .from("notification_alerts")
    .select("id, type, severity, fired_at, context, occurrence_count")
    .in("type", [...LIFECYCLE_ALERT_KEYS])
    .is("resolved_at", null)
    .order("fired_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return data ?? [];
}
